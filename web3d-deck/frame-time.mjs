import pw from 'playwright';
const { chromium } = pw;
const FPS=30;
const b=await chromium.launch({headless:true,executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--force-color-profile=srgb']});
const p=await (await b.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1})).newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+process.cwd()+'/workflow-follow.html',{waitUntil:'load'});
await p.waitForTimeout(2000);
const D=await p.evaluate(()=>window.__DURATION); console.log('DURATION',D);
const N=Math.round(D*FPS);
for(let i=0;i<N;i++){const t=i/FPS;await p.evaluate(tt=>window.__setTime(tt),t);await p.waitForTimeout(35);
  await p.screenshot({path:'frames/f'+String(i).padStart(5,'0')+'.png'});if(i%30===0)process.stdout.write('\r '+i+'/'+N);}
await b.close();console.log('\ndone',N);
