/* Shared transport: repeat one request ID, never a new purchase on retry. */
(function(root){
  async function requestJSON(url,options={}){
    const headers={...(options.headers||{})};
    if(options.method==='POST'&&!headers['X-Request-Id'])headers['X-Request-Id']=crypto.randomUUID();
    const {onRetry,timeoutMs=60000,...init}=options;
    for(let attempt=0;attempt<12;attempt++){
      const controller=typeof AbortController==='function'?new AbortController():null;
      const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
      try{
        const response=await fetch(url,{...init,headers,cache:'no-store',...(controller?{signal:controller.signal}:{})});
        const text=await response.text();
        let value;try{value=JSON.parse(text)}catch{throw Object.assign(Error('接口返回异常：'+response.status),{status:response.status})}
        if(!response.ok)throw Object.assign(Error(value.error||'请求失败：'+response.status),{status:response.status});
        return value;
      }catch(error){
        // Rule/validation failures must not be retried as new game actions.
        if((error.status&&![502,503,504].includes(error.status))||attempt===11)throw error;
        if(timer!==null)clearTimeout(timer);
        const delay=Math.min(10000,500*2**attempt);
        onRetry?.(attempt+1,delay);
        await new Promise(resolve=>setTimeout(resolve,delay));
      }finally{if(timer!==null)clearTimeout(timer)}
    }
  }
  root.requestJSON=requestJSON;
})(globalThis);
