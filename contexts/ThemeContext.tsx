import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// 主题类型定义 - 只保留深夜和白天两个主题
export type ThemeName = 'dark' | 'light';

export interface ThemeColors {
  // 主色调
  primary: string;
  primaryLight: string;
  primaryDark: string;
  
  // 强调色
  accent: string;
  accentLight: string;
  
  // 背景色
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgPanel: string;
  
  // 文字颜色
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  
  // 边框颜色
  border: string;
  borderLight: string;
  
  // 渐变
  gradientStart: string;
  gradientMiddle: string;
  gradientEnd: string;
  
  // 特殊效果
  glow: string;
  shadow: string;
}

export interface ThemeDecorations {
  // 装饰性元素
  snowflakes?: boolean;
  particles?: boolean;
  sparkles?: boolean;
  
  // 背景效果
  backgroundPattern?: string;
  backgroundAnimation?: string;
  
  // 图标/装饰物
  decorations?: string[];
}

export interface Theme {
  name: ThemeName;
  displayName: string;
  icon: string;
  colors: ThemeColors;
  decorations: ThemeDecorations;
}

// 深夜主题 - 默认
const darkTheme: Theme = {
  name: 'dark',
  displayName: '深夜',
  icon: '🌙',
  colors: {
    primary: '#3b82f6',
    primaryLight: '#a5b4fc',
    primaryDark: '#2563eb',
    accent: '#3b82f6',
    accentLight: '#3b82f6',
    bgPrimary: '#0a0a0f',
    bgSecondary: '#12121a',
    bgTertiary: '#1a1a24',
    bgPanel: 'rgba(18, 18, 26, 0.95)',
    textPrimary: '#ffffff',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    border: 'rgba(255, 255, 255, 0.08)',
    borderLight: 'rgba(255, 255, 255, 0.04)',
    gradientStart: '#3b82f6',
    gradientMiddle: '#60a5fa',
    gradientEnd: '#ffffff',
    glow: 'rgba(59, 130, 246, 0.4)',
    shadow: 'rgba(0, 0, 0, 0.4)',
  },
  decorations: {
    snowflakes: false,
    particles: false,
    sparkles: false,
  }
};

// 白天主题 - 精细设计的浅色模式
const lightTheme: Theme = {
  name: 'light',
  displayName: '白天',
  icon: '☀️',
  colors: {
    // 主色调 - 使用更深的蓝色确保在浅色背景上有足够对比度
    primary: '#2563eb',
    primaryLight: '#3b82f6',
    primaryDark: '#1d4ed8',
    accent: '#6366f1',
    accentLight: '#818cf8',
    
    // 背景色 - 使用温暖的白色色调，不是纯灰
    bgPrimary: '#f8f9fc',      // 最底层背景 - 带一点蓝色调的白
    bgSecondary: '#ffffff',    // 卡片背景 - 纯白色，与底层形成对比
    bgTertiary: '#f1f5f9',     // 输入框、按钮背景 - 柔和的灰
    bgPanel: 'rgba(255, 255, 255, 0.98)',  // 弹窗面板
    
    // 文字颜色 - 确保可读性
    textPrimary: '#1e293b',    // 主要文字 - 深灰而不是纯黑
    textSecondary: '#475569',  // 次要文字
    textMuted: '#64748b',      // 辅助文字
    
    // 边框 - 浅色模式下使用更明显的边框
    border: 'rgba(15, 23, 42, 0.1)',      // 主边框
    borderLight: 'rgba(15, 23, 42, 0.06)', // 轻边框
    
    // 渐变
    gradientStart: '#2563eb',
    gradientMiddle: '#3b82f6',
    gradientEnd: '#60a5fa',
    
    // 特殊效果 - 浅色模式用更重的阴影营造层次
    glow: 'rgba(37, 99, 235, 0.15)',
    shadow: 'rgba(15, 23, 42, 0.08)',  // 柔和的阴影
  },
  decorations: {
    snowflakes: false,
    particles: false,
    sparkles: false,
  }
};

// 所有可用主题 - 只保留深夜和白天
export const themes: Record<ThemeName, Theme> = {
  dark: darkTheme,
  light: lightTheme,
};

// Context
interface ThemeContextValue {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  allThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Provider
interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const saved = localStorage.getItem('app_theme');
    // 处理旧版本主题名，统一返回有效主题
    if (saved === 'default' || saved === 'christmas' || saved === 'forest' || 
        saved === 'lavender' || saved === 'sunset' || saved === 'ocean') {
      return 'dark';
    }
    // 默认使用深夜主题
    return (saved as ThemeName) || 'dark';
  });

  const theme = themes[themeName];

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
    localStorage.setItem('app_theme', name);
  };

  // 应用CSS变量
  useEffect(() => {
    const root = document.documentElement;
    const colors = theme.colors;
    
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-primary-light', colors.primaryLight);
    root.style.setProperty('--color-primary-dark', colors.primaryDark);
    root.style.setProperty('--color-accent', colors.accent);
    root.style.setProperty('--color-accent-light', colors.accentLight);
    root.style.setProperty('--color-bg-primary', colors.bgPrimary);
    root.style.setProperty('--color-bg-secondary', colors.bgSecondary);
    root.style.setProperty('--color-bg-tertiary', colors.bgTertiary);
    root.style.setProperty('--color-bg-panel', colors.bgPanel);
    root.style.setProperty('--color-text-primary', colors.textPrimary);
    root.style.setProperty('--color-text-secondary', colors.textSecondary);
    root.style.setProperty('--color-text-muted', colors.textMuted);
    root.style.setProperty('--color-border', colors.border);
    root.style.setProperty('--color-border-light', colors.borderLight);
    root.style.setProperty('--color-gradient-start', colors.gradientStart);
    root.style.setProperty('--color-gradient-middle', colors.gradientMiddle);
    root.style.setProperty('--color-gradient-end', colors.gradientEnd);
    root.style.setProperty('--color-glow', colors.glow);
    root.style.setProperty('--color-shadow', colors.shadow);
    
    // 主题类名：增删而非覆盖 className，避免清掉 html 上其它类
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(`theme-${themeName}`);
  }, [theme, themeName]);

  const value: ThemeContextValue = {
    theme,
    themeName,
    setTheme,
    allThemes: Object.values(themes),
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// 雪花装饰组件 - 已禁用，影响打字性能
export const SnowfallEffect: React.FC = () => {
  // 直接返回 null，不再渲染雪花效果
  return null;
};

// 主题选择器组件
export const ThemeSelector: React.FC<{ className?: string }> = ({ className }) => {
  const { themeName, setTheme, allThemes } = useTheme();
  
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      {allThemes.map((t) => (
        <button
          key={t.name}
          onClick={() => setTheme(t.name)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${
            themeName === t.name
              ? 'bg-white/20 ring-2 ring-white/40 scale-110'
              : 'bg-white/5 hover:bg-white/10 hover:scale-105'
          }`}
          title={t.displayName}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
};
