'use strict';
// Render supplies this trusted service URL; explicit custom-domain configuration wins.
function configurePublicOrigin(env=process.env){
 if(!env.PUBLIC_ORIGIN&&env.RENDER==='true'&&env.RENDER_EXTERNAL_URL){
  const url=new URL(env.RENDER_EXTERNAL_URL);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.onrender.com')||url.username||url.password)throw Error('Invalid Render service origin');
  env.PUBLIC_ORIGIN=url.origin;
 }
 return env.PUBLIC_ORIGIN;
}
module.exports={configurePublicOrigin};
