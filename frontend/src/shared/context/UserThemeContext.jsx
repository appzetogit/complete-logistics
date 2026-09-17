import React, { createContext, useContext, useState, useEffect } from 'react';

const UserThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
});

export const UserThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('userAppTheme');
      return saved === 'light' ? 'light' : 'dark';
    }
    return 'dark';
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('userAppTheme', next);
      return next;
    });
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme === 'dark' ? '#07111f' : '#f6f7fb';
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme]);

  return (
    <UserThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </UserThemeContext.Provider>
  );
};

export const useUserTheme = () => useContext(UserThemeContext);
