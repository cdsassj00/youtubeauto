import pw from 'playwright';
const { chromium } = pw;
const PRESET=process.env.P||'tunnel', FPS=30, DUR=12; // 초
const b=await chromium.launch({headless:true,executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--force-color-profile=srgb']});
const p=await (await b.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1})).newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+process.cwd()+'/presentation-3d.html?p='+PRESET,{waitUntil:'load'});
await p.waitForTimeout(2000); // 폰트+씬 준비
const H=await p.evaluate(()=>document.body.scrollHeight-innerHeight);
const N=FPS*DUR;
const ease=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2; // ease in-out
for(let i=0;i<N;i++){
  const f=ease(i/(N-1));
  await p.evaluate(y=>{window.scrollTo(0,y);}, Math.round(H*f));
  await p.waitForTimeout(45); // 렌더 정착
  await p.screenshot({path:'frames/f'+String(i).padStart(5,'0')+'.png'});
  if(i%30===0)process.stdout.write('\r frame '+i+'/'+N);
}
await b.close();console.log('\ncaptured',N,'frames');
