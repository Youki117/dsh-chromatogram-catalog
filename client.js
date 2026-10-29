window.__ModuleLoader__.load({
  id: 'dsh-chromatogram-catalog',
  factory: require => {
    const React = require('react');
    const h = React.createElement;
    const PANEL = 'chromatogram-catalog';
    const button = { border: '1px solid #c9d5d0', background: '#fff', borderRadius: 7, padding: '6px 11px', cursor: 'pointer', color: '#174c40' };
    const request = async (route, method = 'GET') => {
      const base = window.__DSH_CATALOG__?.url;
      if (!base) throw new Error('插件刚安装或已更新，请重启 DSH 载入图谱工作台');
      const response = await fetch(base + route, { method });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || `请求失败（${response.status}）`);
      return result;
    };
    function useStatus() {
      const [state, setState] = React.useState(null);
      const [error, setError] = React.useState('');
      React.useEffect(() => {
        let active = true;
        const refresh = () => request('status').then(value => { if (active) { setState(value); setError(''); } })
          .catch(error => { if (active) setError(error.message); });
        refresh();
        const timer = setInterval(refresh, 3000);
        return () => { active = false; clearInterval(timer); };
      }, []);
      return [state, error];
    }
    function Workbench() {
      const [status, connectionError] = useStatus();
      const [url, setUrl] = React.useState('');
      const [error, setError] = React.useState('');
      const [loading, setLoading] = React.useState(false);
      const [message, setMessage] = React.useState('');
      const open = async () => {
        setLoading(true); setError('');
        try { setUrl((await request('workbench', 'POST')).url); }
        catch (error) { setError(error.message); }
        finally { setLoading(false); }
      };
      React.useEffect(() => { void open(); }, []);
      const update = async () => {
        if (!window.confirm(`安装图谱插件 ${status.available.version}？\n\n任务会保存在本机。安装完成后请重启 DSH。`)) return;
        setMessage('正在交给 DSH 安装新版，请稍候…');
        try { setMessage((await request('update', 'POST')).message); }
        catch (error) { setMessage(error instanceof TypeError ? '更新连接已中断，请重启 DSH 查看插件版本；若仍是旧版，可重试更新。' : error.message); }
      };
      return h('section', { style: { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: '#f5f7f5', color: '#203b32' } },
        h('header', { style: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #d8e2dc', background: '#fff' } },
          h('strong', null, '典型图谱整理'), h('span', { style: { fontSize: 12 } }, status ? `插件 ${status.version} · ${status.engine}${status.checkedAt && !status.checking && !status.available && !status.checkError ? ' · 已是最新版' : ''}` : '正在连接…'),
          h('span', { style: { flex: 1 } }),
          h('button', { style: button, disabled: !status || status.checking || status.updating, onClick: () => request('check', 'POST').catch(error => setMessage(error.message)) }, status?.checking ? '正在检查更新…' : '检查更新'),
          status?.available && h('button', { style: button, disabled: status.updating, onClick: update }, `更新至 ${status.available.version}`)),
        (status?.available || status?.checkError || message || connectionError) && h('div', { role: 'status', style: { padding: '8px 16px', background: status?.available ? '#e2f2e9' : '#f6eedf', fontSize: 13 } },
          message || connectionError || (status.available ? `发现新版 ${status.available.version}。点击右上角更新，安装后重启 DSH。` : `更新检查：${status.checkError}`),
          status?.available?.notes && h('details', null, h('summary', { style: { cursor: 'pointer' } }, '更新说明'), h('pre', { style: { whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' } }, status.available.notes))),
        url ? h('iframe', { title: '典型图谱整理工作台', src: url, style: { flex: 1, width: '100%', border: 0, minHeight: 0 } }) :
          h('div', { style: { padding: 32 } }, h('p', null, error || (loading ? '首次打开会自动准备本地识别组件，请稍候。' : '图谱工作台尚未启动。')),
            h('button', { style: button, disabled: loading, onClick: open }, loading ? '正在准备…' : '重新打开')));
    }
    function Icon() {
      return h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
        h('path', { d: 'M3 20h18M4 17l4-1 3-12 3 13 3-7 3 7', strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }
    return { inject: ['slots', 'layout'], apply(ctx) {
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, Workbench));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 20, label: () => '典型图谱整理' }, Icon));
      function Reminder() {
        const [status] = useStatus();
        const [hidden, setHidden] = React.useState(false);
        if (!status?.available || hidden) return null;
        return h('aside', { role: 'status', style: { pointerEvents: 'auto', position: 'fixed', right: 24, bottom: 24, maxWidth: 330, background: '#fff', color: '#203b32', border: '1px solid #b6d4c7', borderRadius: 12, boxShadow: '0 8px 30px #0002', padding: 16, zIndex: 9999 } },
          h('strong', null, `图谱插件有新版 ${status.available.version}`),
          h('p', { style: { fontSize: 13 } }, '可在图谱工作台查看说明并更新。'),
          h('button', { style: button, onClick: () => { ctx.layout.selectPanel(PANEL); setHidden(true); } }, '查看更新'), ' ',
          h('button', { style: button, onClick: () => setHidden(true) }, '稍后'));
      }
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'catalog-update-reminder', order: 20 }, Reminder));
    } };
  },
});
