import React from 'react';

export const EditorLoadingBar: React.FC = () => {
  return (
    <div
      className="editor-loading-indicator-track"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '2.5px',
        zIndex: 15,
        overflow: 'hidden',
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
      }}
    >
      <div
        className="repos-linear-progress-bar"
        style={{
          height: '100%',
          backgroundColor: 'var(--primary, #2563eb)',
        }}
      />
    </div>
  );
};
