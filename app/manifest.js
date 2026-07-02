export default function manifest() {
  return {
    name: 'Delovne ure - Kamnoseštvo Čakš',
    short_name: 'Delovne ure',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    theme_color: '#262420',
    background_color: '#F5F1E8',
    display: 'standalone',
    start_url: '/',
  };
}
