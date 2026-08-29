import React, { useState, useEffect } from 'react';

interface LongBeachLogoProps {
  className?: string;
  showText?: boolean;
  variant?: 'brand' | 'luxury' | 'light' | 'dark' | 'monochrome';
  layout?: 'vertical' | 'horizontal' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function LongBeachLogo({
  className = '',
  showText = true,
  variant = 'brand',
  layout = 'vertical',
  size = 'md'
}: LongBeachLogoProps) {
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('custom_hotel_logo');
    }
    return null;
  });

  useEffect(() => {
    const handleLogoChange = () => {
      if (typeof window !== 'undefined') {
        setCustomLogoUrl(localStorage.getItem('custom_hotel_logo'));
      }
    };
    window.addEventListener('logo-changed', handleLogoChange);
    return () => {
      window.removeEventListener('logo-changed', handleLogoChange);
    };
  }, []);

  const logoSrc = customLogoUrl || '/long-beach-logo.png';

  // Dimension definitions for easy UI alignment
  const sizes = {
    sm: {
      imgHeight: 38,
      imgClass: 'h-9 w-auto',
      textClass: 'text-[10px]',
      subtextClass: 'text-[8px]',
      gap: 'gap-2.5'
    },
    md: {
      imgHeight: 58,
      imgClass: 'h-14 w-auto',
      textClass: 'text-xs',
      subtextClass: 'text-[9px]',
      gap: 'gap-3.5'
    },
    lg: {
      imgHeight: 88,
      imgClass: 'h-22 w-auto',
      textClass: 'text-sm',
      subtextClass: 'text-[10px]',
      gap: 'gap-4'
    },
    xl: {
      imgHeight: 130,
      imgClass: 'h-32 w-auto',
      textClass: 'text-lg',
      subtextClass: 'text-xs',
      gap: 'gap-5'
    }
  }[size];

  // Colors & Themes configuration
  const themes = {
    brand: {
      textColor: 'text-white',
      subtitleColor: 'text-orange-400/90',
      containerFilter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))'
    },
    luxury: {
      textColor: 'text-amber-100',
      subtitleColor: 'text-amber-400',
      containerFilter: 'drop-shadow(0 2px 8px rgba(245, 158, 11, 0.2))'
    },
    light: {
      textColor: 'text-zinc-100',
      subtitleColor: 'text-orange-400/80',
      containerFilter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))'
    },
    dark: {
      textColor: 'text-zinc-900',
      subtitleColor: 'text-orange-600',
      containerFilter: 'none'
    },
    monochrome: {
      textColor: 'text-zinc-200',
      subtitleColor: 'text-zinc-400',
      containerFilter: 'grayscale(100%)'
    }
  }[variant];

  const logoImageElement = (
    <img
      src={logoSrc}
      alt="Long Beach Resort Logo"
      style={{
        maxHeight: `${sizes.imgHeight}px`,
        filter: themes.containerFilter,
      }}
      className={`object-contain shrink-0 transition-transform duration-300 hover:scale-[1.03] select-none ${sizes.imgClass}`}
      loading="eager"
      decoding="async"
    />
  );

  // If layout structure is compact / icon-only
  if (layout === 'icon' || !showText) {
    return (
      <div className={`inline-flex items-center justify-center select-none ${className}`}>
        {logoImageElement}
      </div>
    );
  }

  // If layout is horizontal (best for narrow bars, dashboards, headers, sidebars)
  if (layout === 'horizontal') {
    return (
      <div className={`flex items-center ${sizes.gap} select-none ${className}`}>
        {logoImageElement}
        <div className="flex flex-col text-left justify-center">
          <span className={`font-sans tracking-[0.22em] uppercase font-black antialiased leading-tight ${themes.textColor} ${sizes.textClass}`}>
            Long Beach
          </span>
          <span className={`font-mono tracking-[0.28em] uppercase block mt-0.5 leading-none font-bold ${themes.subtitleColor} ${sizes.subtextClass}`}>
            Resort & Spa
          </span>
        </div>
      </div>
    );
  }

  // Default Standard Layout (Vertical Stack) - best for login, certificates, printable lists, center splash
  return (
    <div className={`flex flex-col items-center justify-center text-center select-none ${className}`}>
      {logoImageElement}
      <div className="flex flex-col items-center justify-center text-center mt-2.5">
        <span className={`font-sans tracking-[0.24em] uppercase font-black antialiased ${themes.textColor} ${sizes.textClass}`}>
          Long Beach
        </span>
        <span className={`font-mono tracking-[0.3em] uppercase block mt-1 font-bold ${themes.subtitleColor} ${sizes.subtextClass}`}>
          Resort & Spa
        </span>
      </div>
    </div>
  );
}
