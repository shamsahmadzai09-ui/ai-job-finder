// Behaviour for offline.html (external file so the page works under a strict CSP).
document.getElementById('retry')?.addEventListener('click', () => {
  window.location.href = './';
});
window.addEventListener('online', () => {
  window.location.href = './';
});
