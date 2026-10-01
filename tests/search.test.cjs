const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(){
 const nodes=new Map(),calls=[],renders=[],observers=[];
 const node=()=>({value:'',innerHTML:'',textContent:'',style:{},children:[],appendChild(n){this.children.push(n)},remove(){this.removed=true}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const app={navStack:['home'],homeStack:[],currentFilter:'',currentSort:'',currentSearchQuery:'',currentSearchPage:0,hasMoreResults:true,isLoadingMore:false};
 const context={app,document:{getElementById:get,createElement:node},window:{scrollTo:()=>{}},esc:String,toast:()=>{},Storage:{},UI:{renderVideoList:(res,id,append)=>renders.push({res,id,append})},API:{prefetchVideos:()=>{},search:(query,page,filter,sort)=>new Promise((resolve,reject)=>calls.push({query,page,filter,sort,resolve,reject}))},IntersectionObserver:class{constructor(callback){this.callback=callback;observers.push(this)}observe(){}disconnect(){this.disconnected=true}}};
 vm.createContext(context);
 for(const file of ['navigation.js','search.js'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+file,'utf8'),context);
 get('search-input').value='first';
 return {app,get,calls,renders,observers};
}
const videos=n=>Array.from({length:n},(_,i)=>({type:'video',videoId:String(i)}));
test('an older search response cannot overwrite a newer search',async()=>{
 const f=fixture();const first=f.app.search();f.get('search-input').value='second';const second=f.app.search();
 f.calls[1].resolve(videos(3));await second;f.calls[0].resolve(videos(20));await first;
 assert.equal(f.renders.length,1);assert.equal(f.renders[0].res.length,3);assert.equal(f.app.currentSearchQuery,'second');assert.equal(f.app.hasMoreResults,false);
});
test('a terminal first page remains terminal after observer setup',async()=>{
 const f=fixture();const pending=f.app.search();f.calls[0].resolve(videos(5));await pending;
 assert.equal(f.app.hasMoreResults,false);f.observers.at(-1).callback([{isIntersecting:true}]);assert.equal(f.calls.length,1);
});
test('pagination uses the submitted query and prevents concurrent appends',async()=>{
 const f=fixture();const first=f.app.search();f.calls[0].resolve(videos(20));await first;
 f.get('search-input').value='not submitted';const next=f.app.search(2,true);await f.app.search(2,true);
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].query,'first');f.calls[1].resolve(videos(1));await next;assert.equal(f.app.currentSearchPage,2);
});
test('a failed next page keeps its page number and can be retried',async()=>{
 const f=fixture();const first=f.app.search();f.calls[0].resolve(videos(20));await first;
 const next=f.app.search(2,true);f.calls[1].reject(Error('offline'));await next;
 assert.equal(f.app.currentSearchPage,1);assert.equal(f.app.isLoadingMore,false);
 const retry=f.get('search-res-list').children.at(-1);retry.onclick();assert.equal(f.calls[2].page,2);
 f.calls[2].resolve(videos(20));await new Promise(r=>setImmediate(r));assert.equal(f.app.currentSearchPage,2);assert.equal(f.app.hasMoreResults,true);assert.equal(f.observers.at(-1).disconnected,undefined);
});
test('a search error replaces the loading message and exposes retry',async()=>{
 const f=fixture();const pending=f.app.search();f.calls[0].reject(Error('offline'));await pending;
 assert.match(f.get('search-res-list').textContent,/検索に失敗/);assert.equal(f.get('search-res-list').children.at(-1).textContent,'再試行');assert.equal(f.app.isLoadingMore,false);
});
test('a response after leaving the search screen is ignored',async()=>{
 const f=fixture();const pending=f.app.search();f.app.homeState='channel';f.calls[0].resolve(videos(20));await pending;assert.equal(f.renders.length,0);
});
