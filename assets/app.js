(() => {
  const ensureIcon = (rel, sizes) => {
    if (document.querySelector(`link[rel="${rel}"]`)) return;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = "assets/tn170-logo.png";
    if (sizes) link.sizes = sizes;
    link.type = "image/png";
    document.head.appendChild(link);
  };

  ensureIcon("icon", "any");
  ensureIcon("apple-touch-icon", "180x180");
})();

(() => {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.overlay');
  const open = () => { sidebar?.classList.add('open'); overlay?.classList.add('show'); };
  const close = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('show'); };
  document.querySelector('#menuBtn')?.addEventListener('click', open);
  document.querySelectorAll('[data-close-menu]').forEach(el => el.addEventListener('click', close));

  const toast = document.querySelector('.toast');
  let timer;
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('show'), 3200);
  };
  document.querySelectorAll('[data-toast]').forEach(el => el.addEventListener('click', () => showToast(el.dataset.toast || 'Preview action')));

  const search = document.querySelector('#globalSearch');
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      search?.focus();
    }
    if (event.key === 'Escape') { close(); search?.blur(); }
  });
  search?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      showToast(`Search preview: ${search.value || 'Enter a search term'}`);
    }
  });

  document.querySelectorAll('form').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    showToast('Preview saved locally. Secure backend connection comes next.');
  }));
})();