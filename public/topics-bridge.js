(function(){
  const qs = new URLSearchParams(location.search);
  const t = qs.get('topics');
  if(!t) return;
  try{
    const groups = t.split(',').map(s => s.trim()).filter(Boolean);
    localStorage.setItem('st_topics_groups', JSON.stringify(groups));
    localStorage.setItem('st_topics_groups_ts', String(Date.now()));
    window.dispatchEvent(new CustomEvent('topics-from-url', { detail: groups }));
  }catch(e){
    console.warn('topics-bridge failed', e);
  }
})();