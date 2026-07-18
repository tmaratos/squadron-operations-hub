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