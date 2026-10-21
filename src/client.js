window.__ModuleLoader__.load({ id: '@fegnze/dsh-mcp-manager', factory: require => {
  const React = require('react'), h = React.createElement;
  const PKG='dsh-mcps-manager';
  async function call(body) {
    const response=await fetch('/dsh-mcps-manager/api',{method:body?'POST':'GET',credentials:'same-origin',headers:{'x-dsh-mcps-manager':'1',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let payload;try{payload=await response.json();}catch{throw Error('服务暂不可用，请稍后刷新');}
    if(!response.ok||!payload.ok)throw Error(payload.error?.code??'请求失败');return payload.value;
  }
  const button=(text,onClick,disabled=false)=>h('button',{type:'button',onClick,disabled},text);
  function Panel() {
    const mine=true;
    const [data,setData]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    const [text,setText]=React.useState(''),[preview,setPreview]=React.useState(null),[editing,setEditing]=React.useState(null),[keep,setKeep]=React.useState(true);
    const [importing,setImporting]=React.useState(false);
    const checking=React.useRef(false),mounted=React.useRef(false),queued=React.useRef(false);
    const load=async()=>{
      if(checking.current){queued.current=true;return;}
      checking.current=true;
      try{
        const view=await call();if(!mounted.current)return;
        setData(view);setError('');
        // One bounded, read-only request at a time; never invoke business tools.
        for(const item of view.servers.filter(item=>item.enabled)){
          if(!mounted.current||document.visibilityState==='hidden')break;
          try{
            const result=await call({action:'check',serverName:item.serverName,revision:view.revision});
            if(mounted.current)setData(current=>current?.revision===view.revision?{...current,servers:current.servers.map(row=>row.serverName===item.serverName?{...row,lastCheck:result}:row)}:current);
          }catch(e){if(mounted.current)setError(e.message);}
        }
      }catch(e){if(mounted.current)setError(e.message);}finally{checking.current=false;if(queued.current&&mounted.current){queued.current=false;void load();}}
    };
    React.useEffect(()=>{
      mounted.current=true;void load();
      const refresh=()=>{if(document.visibilityState!=='hidden')void load();};
      const timer=setInterval(refresh,60000);
      document.addEventListener('visibilitychange',refresh);
      return()=>{mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
    },[]);
    if(!mine)return null;
    async function run(action){setBusy(true);setError('');try{await action();}catch(e){setError(e.message);}finally{setBusy(false);}}
    async function mutate(body){
      let execution='';
      if(body.action==='toggle'&&body.enabled){
        const detail=await call({action:'executionPreview',serverName:body.serverName});
        if(detail.revision!==data.revision)throw Error('配置已变化，请刷新');
        execution=detail.transport==='stdio'?`将执行：${JSON.stringify([detail.command,...detail.args])}\n工作目录：${detail.cwd||'宿主默认'}\n`:`将连接：${detail.endpoint}\n`;
      }
      if(!window.confirm(execution+'保存将重新加载本插件管理的全部 MCP 服务，可能中断正在进行的工具调用。是否继续？'))return;
      await call({...body,revision:data.revision,confirm:true});setPreview(null);setText('');setEditing(null);setImporting(false);await load();
    }
    const row=(item,index,external=false)=>h('article',{className:'mcpm-row',key:`${external}-${item.serverName??index}`},
      h('div',{className:'mcpm-info'},h('div',{className:'mcpm-name'},item.serverName??'外部配置'),
        h('div',{className:'mcpm-meta'},[item.transport,item.endpoint].filter(Boolean).join(' · ')),
        h('small',{className:'mcpm-status'},item.lastCheck?`检查${item.lastCheck.successful?'成功':'未通过'} · ${new Date(item.lastCheck.at).toLocaleTimeString()}（非实时）`:item.enabled?'已启用 · 等待检查':'已停用')),
      !external&&h('div',{className:'mcpm-actions'},
        h('button',{type:'button',role:'switch','aria-checked':!!item.enabled,'aria-label':`${item.serverName} 启用`,className:'mcpm-switch',disabled:busy,onClick:()=>run(()=>mutate({action:'toggle',serverName:item.serverName,enabled:!item.enabled}))},h('span')),
        h('details',{className:'mcpm-menu'},h('summary',{'aria-label':`${item.serverName} 更多操作`},'•••'),h('div',{className:'mcpm-menu-items'},
          button('编辑',()=>{setEditing(item.serverName);setImporting(true);setText('');setPreview(null);setKeep(true);},busy),
          button('删除',()=>run(()=>mutate({action:'remove',serverName:item.serverName})),busy)))));
    return h('section',{className:'mcpm'},
      h('div',{className:'mcpm-header'},h('h3',null,'MCP 管理'),h('div',{className:'mcpm-actions'},button('刷新',()=>run(load),busy),button('新增服务',()=>{setImporting(true);setEditing(null);setPreview(null);setText('');},busy))),
      error&&h('p',{role:'alert'},error),
      data&&h('div',null,...data.servers.map((item,i)=>row(item,i))),
      data?.external?.length>0&&h('details',null,h('summary',null,'其他插件管理的服务（只读）'),...data.external.map((item,i)=>row(item,i,true))),
      importing&&h('div',{className:'mcpm-import'},h('h4',null,editing?`替换配置：${editing}`:'导入 MCP 配置'),
      h('textarea',{value:text,disabled:busy,rows:9,spellCheck:false,'aria-label':'MCP JSON 配置',placeholder:'{"mcpServers":{"utools":{"type":"http","url":"http://127.0.0.1:3501/mcp","headers":{"x-mcp-key":"…"}}}}',onChange:e=>{setText(e.target.value);setPreview(null);},autoComplete:'off'}),
      editing&&h('label',null,h('input',{type:'checkbox',checked:keep,onChange:e=>setKeep(e.target.checked)}),'保留原有 headers / env（替换 JSON 中须省略对应字段）'),
      h('div',{className:'mcpm-actions'},
        editing?button('保存替换并停用',()=>run(()=>mutate({action:'update',serverName:editing,text,headersMode:keep?'keep':'replace',envMode:keep?'keep':'replace'})),busy||!data||!text):button('预览导入',()=>run(async()=>setPreview(await call({action:'preview',text}))),busy||!text),
        button('取消',()=>{setEditing(null);setImporting(false);setPreview(null);setText('');},busy)),
      ),
      preview&&h('div',{className:'mcpm-card'},h('strong',null,`${preview.count} 个服务，导入后默认停用`),...preview.servers.map((item,i)=>row(item,i,true)),button('确认导入',()=>run(async()=>{if(preview.revision!==data?.revision)throw Error('配置已变化，请刷新并重新预览');await mutate({action:'import',text});}),busy||!preview.count)),
      data&&h('details',null,h('summary',null,`全局已注册 MCP 工具（${data.tools.length}）`),h('ul',null,...data.tools.map(tool=>h('li',{key:tool.name},h('code',null,tool.name)))))
    );
  }
  return {inject:['slots'],apply(ctx){
    ctx.effect(()=>{const tag=document.createElement('style');tag.dataset.plugin=PKG;tag.textContent='.mcpm{color:var(--dsw-alias-label-primary);width:100%;min-width:0;font-size:14px}.mcpm .mcpm-header{display:flex;justify-content:space-between;align-items:center;gap:16px;width:100%;box-sizing:border-box;margin:0 0 12px;padding:0;background:none;border:0;border-radius:0;box-shadow:none;backdrop-filter:none;text-align:left}.mcpm .mcpm-header h3{font-size:20px;font-weight:600;margin:0;padding:0;text-align:left;background:none;border:0;box-shadow:none}.mcpm h4{font-size:14px;margin:0 0 16px}.mcpm-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:24px 0;border-bottom:1px solid var(--dsw-alias-border-l3)}.mcpm-info{min-width:0;overflow-wrap:anywhere}.mcpm-name{font-size:15px;font-weight:500;margin-bottom:6px}.mcpm-meta,.mcpm-status{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7}.mcpm-actions{display:flex;align-items:center;gap:12px;flex-shrink:0}.mcpm button,.mcpm-menu>summary{box-sizing:border-box;font:inherit;color:inherit;border:0;border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:9px 16px;cursor:pointer;white-space:nowrap}.mcpm-header button:first-child{background:transparent;color:var(--dsw-alias-label-secondary)}.mcpm button:hover,.mcpm-menu>summary:hover{background:var(--dsw-alias-bg-layer-3)}.mcpm button:focus-visible,.mcpm summary:focus-visible{outline:2px solid var(--dsw-alias-label-secondary);outline-offset:3px}.mcpm button:disabled{opacity:.45;cursor:default}.mcpm button.mcpm-switch{width:38px;height:22px;padding:3px;background:var(--dsw-alias-label-secondary);border-radius:20px}.mcpm-switch span{display:block;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}.mcpm button.mcpm-switch[aria-checked=true]{background:var(--dsw-alias-accent-primary,#3979dc)}.mcpm-switch[aria-checked=true] span{transform:translateX(16px)}.mcpm-menu{position:relative}.mcpm-menu>summary{list-style:none;background:transparent;padding:6px 10px}.mcpm-menu>summary::-webkit-details-marker{display:none}.mcpm-menu-items{position:absolute;right:0;top:100%;z-index:2;display:flex;flex-direction:column;min-width:96px;padding:4px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 6px 24px #0002}.mcpm-menu-items button{text-align:left}.mcpm>details{padding:20px 0;border-bottom:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary)}.mcpm summary{cursor:pointer;font-size:13px}.mcpm-import{margin:24px 0;padding:20px;border-radius:14px;background:var(--dsw-alias-bg-layer-1)}.mcpm textarea{display:block;width:100%;box-sizing:border-box;font:12px/1.6 monospace;background:transparent;color:inherit;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;padding:12px;margin-bottom:16px;resize:vertical}.mcpm-import label{display:block;font-size:12px;margin-bottom:16px}.mcpm-card{padding:16px 0}.mcpm [role=alert]{color:var(--dsw-alias-state-error-primary)}@media(max-width:620px){.mcpm-header{align-items:flex-start;flex-wrap:wrap}.mcpm-row{gap:12px}.mcpm-actions{gap:6px}.mcpm button{padding:8px 12px}}';document.head.appendChild(tag);return()=>tag.remove();});
    ctx.effect(()=>ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({name:'plugins.bundle.config',key:PKG},Panel)));
    ctx.effect(()=>ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:PKG,order:35,label:()=> 'MCP 管理'},Panel)));
  }};
}});
