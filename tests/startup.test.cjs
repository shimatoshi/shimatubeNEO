const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(fetch){
 const timers=[],nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:''});return nodes.get(id)};
 const ctx={fetch,AbortController,setTimeout:(fn)=>{const t={fn};timers.push(t);return t},clearTimeout:t=>{t.cleared=true},localStorage:{getItem:()=>null,setItem:()=>{}},document:{cookie:'',getElementById:get},navigator:{},crypto:{randomUUID:()=> 'test-user'},console:{warn:()=>{},error:()=>{},log:()=>{}},esc:String};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../js/app.js','utf8')+';globalThis.app=app;',ctx);
 vm.runInContext(fs.readFileSync(__dirname+'/../js/search.js','utf8'),ctx);
 Object.assign(ctx.app,{destroyInfiniteScroll:()=>{},resetHomeStack:()=>{},navStack:['home']});
 return {ctx,timers,get,app:ctx.app};
}
test('settings HTTP failure shows recovery instead of permanent loading',async()=>{
 const f=fixture(async()=>({ok:false,status:503}));await f.app.loadUserData();await f.app.renderHome();
 assert.match(f.get('home-list').innerHTML,/再試行/);assert.doesNotMatch(f.get('home-list').innerHTML,/読み込み中/);
 assert.equal(f.app.userDataLoading,false);assert.equal(f.timers[0].cleared,true);
});
test('stalled settings request aborts and releases loading state',async()=>{
 const f=fixture((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')))));
 const pending=f.app.loadUserData();f.timers[0].fn();await pending;
 assert.equal(f.app.userDataError,true);assert.equal(f.app.userDataLoading,false);assert.equal(f.timers[0].cleared,true);
});
test('invalid settings are rejected and retry preserves an existing user profile',async()=>{
 const f=fixture(async()=>({ok:true,json:async()=>({message:'offline'})}));const existing={categories:['Music']};f.app.userData=existing;
 assert.equal(await f.app.loadUserData(),false);assert.equal(f.app.userData,existing);
});
test('successful retry clears error without replacing an active search',async()=>{
 const f=fixture(async()=>({ok:true,json:async()=>({categories:[]})}));f.app.userDataError=true;
 const pending=f.app.retryUserData();f.app.homeState='search';f.get('home-list').innerHTML='search result';await pending;
 assert.equal(f.app.userDataError,false);assert.equal(f.get('home-list').innerHTML,'search result');
});
