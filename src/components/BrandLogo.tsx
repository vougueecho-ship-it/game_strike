import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  subtitle?: string;
  darkText?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText = true,
  subtitle,
}) => {
  const iconDims = size === 'sm' ? 32 : size === 'lg' ? 48 : 38;

  return (
    <div className="gs-brand" style={{ display: 'inline-flex', alignItems: 'center', gap: size === 'sm' ? 9 : 11 }}>
      <div
        className="gs-logo-emblem"
        style={{
          width: iconDims,
          height: iconDims,
          borderRadius: size === 'sm' ? 9 : 12,
          overflow: 'hidden',
          flexShrink: 0,
          boxShadow: '0 4px 14px rgba(37, 99, 235, 0.28)',
          border: '1px solid rgba(6, 182, 212, 0.35)',
          background: '#0B1120',
          position: 'relative',
        }}
      >
        <img
          src="/gamestrike-logo.jpg"
          alt="GameStrike.io Logo"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scale(1.18)',
            display: 'block',
          }}
        />
      </div>

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span
            className="gs-brand-wordmark"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: size === 'sm' ? '1.02rem' : size === 'lg' ? '1.48rem' : '1.16rem',
              letterSpacing: '-0.03em',
              display: 'inline-flex',
              alignItems: 'baseline',
            }}
          >
            <span>Game</span>
            <span className="gs-gradient-text">Strike</span>
            <span className="gs-brand-tld">.io</span>
          </span>
          {subtitle && (
            <span className="gs-brand-sub">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

