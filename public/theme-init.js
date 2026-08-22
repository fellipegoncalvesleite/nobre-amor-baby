try {
  const theme = localStorage.getItem('nobre_amor_v1_theme');
  if (theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme:dark)').matches)) {
    document.documentElement.classList.add('dark');
    document.querySelector('meta[name="theme-color"]').content = '#1C1720';
  }
} catch {}
