function statusView(item, {checking = false, external = false} = {}) {
  const name = item?.serverName;
  if (!external && item?.enabled === false) return {label: '已停用', tone: 'disabled'};
  if (!external && checking && checking === name) return {label: '检查中', tone: 'checking', spinner: true};
  if (external) return {label: item?.enabled ? '已启用（未检测）' : '未启用', tone: item?.enabled ? 'enabled' : 'disabled'};
  if (item?.lastCheck?.successful) return {label: '✓ 检查通过', tone: 'success'};
  if (item?.lastCheck && item.lastCheck.successful === false) return {label: '! 检查未通过', tone: 'failed'};
  if (item?.enabled) return {label: '未检查', tone: 'enabled'};
  return {label: '未检查', tone: 'enabled'};
}

window.__ModuleLoader__.load({ id: '@fegnze/dsh-mcp-manager', factory: require => {
  const React = require('react'), h = React.createElement;
  const PKG='dsh-mcps-manager';
  async function call(body) {
    const response=await fetch('/dsh-mcps-manager/api',{method:body?'POST':'GET',credentials:'same-origin',headers:{'x-dsh-mcps-manager':'1',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let payload;try{payload=await response.json();}catch{throw Error('服务暂不可用，请稍后刷新');}
    if(!response.ok||!payload.ok)throw Error(payload.error?.code??'请求失败');return payload.value;
  }
  const button=(text,onClick,disabled=false)=>h('button',{type:'button',className:text==='新增服务'||text==='确认导入'?'mcpm-primary':undefined,onClick,disabled},text);
  function statusBadge(item, checking, external) {
    const status=statusView(item,{checking,external});
    return h('span',{className:`mcpm-badge mcpm-badge-${status.tone}`,'aria-label':status.label},status.spinner&&h('span',{className:'mcpm-spinner','aria-hidden':'true'}),status.label);
  }
  function Panel() {
    const mine=true;
    const [data,setData]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    const [text,setText]=React.useState(''),[preview,setPreview]=React.useState(null),[editing,setEditing]=React.useState(null),[keep,setKeep]=React.useState(true);
    const [importing,setImporting]=React.useState(false),[checkingName,setCheckingName]=React.useState(null);
    const checking=React.useRef(false),mounted=React.useRef(false),queued=React.useRef(false);
    const load=async()=>{
      if(checking.current){queued.current=true;return;}
      checking.current=true;
      try{
        const view=await call();if(!mounted.current)return;
        setData(view);setError('');
        for(const item of view.servers.filter(item=>item.enabled)){
          if(!mounted.current||document.visibilityState==='hidden')break;
          setCheckingName(item.serverName);
          try{
            const result=await call({action:'check',serverName:item.serverName,revision:view.revision});
            if(mounted.current)setData(current=>current?.revision===view.revision?{...current,servers:current.servers.map(row=>row.serverName===item.serverName?{...row,lastCheck:result}:row)}:current);
          }catch(e){if(mounted.current)setError('服务检查请求失败，请刷新重试');}
          finally{if(mounted.current)setCheckingName(current=>current===item.serverName?null:current);}
        }
      }catch(e){if(mounted.current)setError('无法读取服务配置，请刷新重试');}
      finally{checking.current=false;if(mounted.current){setCheckingName(null);if(queued.current){queued.current=false;void load();}}}
    };
    React.useEffect(()=>{
      mounted.current=true;void load();
      const refresh=()=>{if(document.visibilityState!=='hidden')void load();};
      const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
      return()=>{mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
    },[]);
    if(!mine)return null;
    async function run(action){setBusy(true);setError('');try{await action();}catch(e){setError(e.message);}finally{if(mounted.current)setBusy(false);}}
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
    const row=(item,index,external=false)=>{
      const status=statusView(item,{checking:checkingName,external});
      const meta=[item.transport,item.endpoint&&item.endpoint!==item.transport?item.endpoint:null].filter(Boolean).join(' · ');
      return h('article',{className:`mcpm-card mcpm-card-${status.tone}`,key:`${external}-${item.serverName??index}`},
        h('div',{className:'mcpm-info'},h('div',{className:'mcpm-title-line'},h('div',{className:'mcpm-name'},item.serverName??'外部配置'),statusBadge(item,checkingName,external)),
          meta&&h('div',{className:'mcpm-meta'},meta)),
        !external&&h('div',{className:'mcpm-actions'},
          h('button',{type:'button',role:'switch','aria-checked':!!item.enabled,'aria-label':`${item.serverName} 启用`,className:'mcpm-switch',disabled:busy,onClick:()=>run(()=>mutate({action:'toggle',serverName:item.serverName,enabled:!item.enabled}))},h('span')),
          h('details',{className:'mcpm-menu'},h('summary',{'aria-label':`${item.serverName} 更多操作`},'•••'),h('div',{className:'mcpm-menu-items'},
            button('编辑',()=>{setEditing(item.serverName);setImporting(true);setText('');setPreview(null);setKeep(true);},busy),button('删除',()=>run(()=>mutate({action:'remove',serverName:item.serverName})),busy)))));
    };
    return h('section',{className:'mcpm'},
      h('div',{className:'mcpm-header'},h('h3',null,'MCP 管理'),h('div',{className:'mcpm-actions'},button('刷新',()=>run(load),busy),button('新增服务',()=>{setImporting(true);setEditing(null);setPreview(null);setText('');},busy))),
      error&&h('p',{role:'alert',className:'mcpm-alert'},error),
      data&&h('div',{className:'mcpm-list'},...data.servers.map((item,i)=>row(item,i))),
      data?.external?.length>0&&h('section',{className:'mcpm-panel'},h('div',{className:'mcpm-panel-title'},h('strong',null,'其他插件管理的服务'),h('span',{className:'mcpm-readonly'} ,'只读')),h('div',{className:'mcpm-list'},...data.external.map((item,i)=>row(item,i,true)))),
      importing&&h('section',{className:'mcpm-panel mcpm-import'},h('h4',null,editing?`替换配置：${editing}`:'导入 MCP 配置'),
        h('textarea',{value:text,disabled:busy,rows:9,spellCheck:false,'aria-label':'MCP JSON 配置',placeholder:'{"mcpServers":{"utools":{"type":"http","url":"http://127.0.0.1:3501/mcp","headers":{"x-mcp-key":"…"}}}}',onChange:e=>{setText(e.target.value);setPreview(null);},autoComplete:'off'}),
        editing&&h('label',null,h('input',{type:'checkbox',checked:keep,onChange:e=>setKeep(e.target.checked)}),'保留原有 headers / env（替换 JSON 中须省略对应字段）'),h('div',{className:'mcpm-actions'},editing?button('保存替换并停用',()=>run(()=>mutate({action:'update',serverName:editing,text,headersMode:keep?'keep':'replace',envMode:keep?'keep':'replace'})),busy||!data||!text):button('预览导入',()=>run(async()=>setPreview(await call({action:'preview',text}))),busy||!text),button('取消',()=>{setEditing(null);setImporting(false);setPreview(null);setText('');},busy))),
      preview&&h('section',{className:'mcpm-panel mcpm-preview'},h('strong',null,`${preview.count} 个服务，导入后默认停用`),...preview.servers.map((item,i)=>row(item,i,true)),button('确认导入',()=>run(async()=>{if(preview.revision!==data?.revision)throw Error('配置已变化，请刷新并重新预览');await mutate({action:'import',text});}),busy||!preview.count)),
      data&&h('details',{className:'mcpm-panel mcpm-tools'},h('summary',null,`全局已注册 MCP 工具（${data.tools.length}）`),h('ul',null,...data.tools.map(tool=>h('li',{key:tool.name},h('code',null,tool.name)))))
    );
  }
  return {statusView,inject:['slots'],apply(ctx){
    ctx.effect(()=>{const tag=document.createElement('style');tag.dataset.plugin=PKG;tag.textContent='.mcpm{color:var(--dsw-alias-label-primary);width:100%;min-width:0;font-size:14px}.mcpm .mcpm-header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0 0 16px;padding:0;background:transparent;border:0;border-radius:0;box-shadow:none;backdrop-filter:none;text-align:left}.mcpm .mcpm-header h3{font-size:20px;margin:0;padding:0;text-align:left;background:none;border:0;box-shadow:none}.mcpm-list{display:grid;gap:16px}.mcpm-card,.mcpm-panel{box-sizing:border-box;border:.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill);box-shadow:none}.mcpm-card{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;min-height:68px}.mcpm-info{min-width:0;overflow-wrap:anywhere}.mcpm-title-line{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.mcpm-name{font-weight:600}.mcpm-meta{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}.mcpm-meta{margin-top:4px}.mcpm-actions{display:flex;align-items:center;gap:9px;flex-shrink:0}.mcpm button,.mcpm-menu>summary{box-sizing:border-box;font:inherit;color:inherit;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:transparent;min-width:58px;height:36px;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;white-space:nowrap}.mcpm button:hover,.mcpm-menu>summary:hover{background:var(--dsw-alias-interactive-bg-hover)}.mcpm button:focus-visible,.mcpm summary:focus-visible{outline:2px solid var(--dsw-alias-label-secondary);outline-offset:3px}.mcpm button.mcpm-primary{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-primary-fill);border-color:transparent;font-weight:500}.mcpm button.mcpm-primary:hover{background:var(--dsw-alias-button-primary-hover)}.mcpm button:disabled{opacity:.45;cursor:default}.mcpm button.mcpm-switch{min-width:0;width:38px;height:22px;padding:3px!important;background:var(--dsw-alias-label-secondary)!important;border-radius:20px!important}.mcpm-switch span{display:block;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}.mcpm-switch[aria-checked=true]{background:var(--dsw-alias-button-primary-fill)!important}.mcpm-switch[aria-checked=true] span{transform:translateX(16px)}.mcpm-menu{position:relative}.mcpm-menu>summary{list-style:none}.mcpm-menu>summary::-webkit-details-marker{display:none}.mcpm-menu-items{position:absolute;right:0;z-index:2;display:grid;gap:4px;margin-top:5px;padding:6px;border:1px solid var(--dsw-alias-border-l3);border-radius:9px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 5px 16px rgba(0,0,0,.18)}.mcpm-badge,.mcpm-readonly{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:500;line-height:1.3;border:0}.mcpm-badge-disabled{color:var(--dsw-alias-label-secondary)}.mcpm-badge-enabled{color:var(--dsw-alias-label-secondary)}.mcpm-badge-checking{color:var(--dsw-alias-state-business-primary)}.mcpm-badge-success{color:var(--dsw-alias-label-primary)}.mcpm-badge-failed{color:var(--dsw-alias-label-primary)}.mcpm-spinner{width:10px;height:10px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:mcpm-spin .7s linear infinite}@keyframes mcpm-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.mcpm-spinner{animation:none}.mcpm-switch span{transition:none}}.mcpm-panel{margin-top:16px;padding:16px}.mcpm-panel-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.mcpm-readonly{color:var(--dsw-alias-label-secondary);font-weight:500}.mcpm-panel .mcpm-card{box-shadow:none}.mcpm-import textarea{display:block;width:100%;box-sizing:border-box;resize:vertical;color:inherit;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l3);border-radius:9px;padding:10px;font:12px/1.5 ui-monospace,monospace;margin-bottom:12px}.mcpm-alert{color:var(--dsw-alias-label-primary)}.mcpm-tools summary{cursor:pointer}.mcpm-tools ul{margin-bottom:0;max-height:240px;overflow:auto;padding-left:20px}@media(max-width:560px){.mcpm-card{align-items:flex-start;flex-wrap:wrap}.mcpm-actions{margin-left:auto}.mcpm-header{align-items:flex-start;flex-wrap:wrap}}';document.head.appendChild(tag);return()=>tag.remove()});
    ctx.effect(()=>ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({name:'plugins.bundle.config',key:PKG},Panel)));
    ctx.effect(()=>ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:PKG,order:35,label:()=> 'MCP 管理'},Panel)));
  }};
}});
