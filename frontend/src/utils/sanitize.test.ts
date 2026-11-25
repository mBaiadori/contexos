import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeSvg, isSafeUrl } from './sanitize';
import { XSS_PAYLOADS } from './xss-corpus';

describe('Frontend XSS Sanitization & URL Safety', () => {
  it('sanitizeHtml should neutralize all payloads in the XSS corpus', () => {
    for (const payload of XSS_PAYLOADS) {
      const sanitized = sanitizeHtml(payload.raw);

      if (payload.dangerousTags) {
        for (const tag of payload.dangerousTags) {
          expect(sanitized.toLowerCase()).not.toContain(`<${tag}`);
          expect(sanitized.toLowerCase()).not.toContain(`</${tag}>`);
        }
      }

      if (payload.dangerousAttributes) {
        for (const attr of payload.dangerousAttributes) {
          expect(sanitized.toLowerCase()).not.toContain(`${attr}=`);
        }
      }

      if (payload.dangerousProtocols) {
        for (const proto of payload.dangerousProtocols) {
          expect(sanitized.toLowerCase()).not.toContain(`href="${proto}`);
          expect(sanitized.toLowerCase()).not.toContain(`href='${proto}`);
        }
      }
    }
  });

  it('isSafeUrl should only accept http, https, mailto, tel and relative paths', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://localhost:3000')).toBe(true);
    expect(isSafeUrl('mailto:test@example.com')).toBe(true);
    expect(isSafeUrl('/docs/guide.md')).toBe(true);
    expect(isSafeUrl('./relative.md')).toBe(true);
    expect(isSafeUrl('#section-1')).toBe(true);

    expect(isSafeUrl('https://example.com/api?connection=true&action=on_status')).toBe(true);
    expect(isSafeUrl('https://example.com?toggle=on&connection=1')).toBe(true);

    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JAVASCRIPT:alert(1)')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false);
    expect(isSafeUrl('javascript\n:alert(1)')).toBe(false);
    expect(isSafeUrl('//evil.com')).toBe(false);
    expect(isSafeUrl('//evil.com/phishing.md')).toBe(false);
  });

  it('sanitizeHtml should block protocol-relative beacons and purge DOM clobbering tags/attributes (M5)', () => {
    // 1. Protocol-relative beacon deve ter src neutralizado
    const beaconHtml = sanitizeHtml('<img src="//evil.com/beacon.png" alt="beacon">');
    expect(beaconHtml.toLowerCase()).not.toContain('//evil.com');

    // 2. Tags input de phishing devem ser removidas
    const inputHtml = sanitizeHtml('<input type="password" placeholder="Digite sua senha">');
    expect(inputHtml.toLowerCase()).not.toContain('<input');

    // 3. Atributos de DOM clobbering (id, contenteditable) devem ser removidos
    const clobberHtml = sanitizeHtml('<div id="adminPanel" contenteditable="true" data-type="block">Conteúdo</div>');
    expect(clobberHtml.toLowerCase()).not.toContain('id=');
    expect(clobberHtml.toLowerCase()).not.toContain('contenteditable=');
    expect(clobberHtml).toContain('data-type="block"');
  });

  it('sanitizeSvg should purge malicious scripts and handlers from SVGs', () => {
    const maliciousSvg = `<svg onload="alert(1)"><script>alert(2)</script><rect width="10" height="10"/></svg>`;
    const safeSvg = sanitizeSvg(maliciousSvg);

    expect(safeSvg).not.toContain('<script');
    expect(safeSvg).not.toContain('onload=');
    expect(safeSvg).toContain('<rect');
  });

  it('sanitizeSvg should preserve SVG text/tspan labels while stripping unsafe scripts', () => {
    const mermaidSvg = `
      <svg viewBox="0 0 200 100">
        <g class="node">
          <rect width="120" height="40"></rect>
          <text x="60" y="20"><tspan>Microcontrolador</tspan></text>
        </g>
        <script>alert('xss')</script>
      </svg>
    `;
    const safeSvg = sanitizeSvg(mermaidSvg);

    expect(safeSvg).toContain('<text');
    expect(safeSvg).toContain('Microcontrolador');
    expect(safeSvg).not.toContain('<script');
  });
});
