'use strict';
const {validateMetadata}=require('./card-metadata');
const themes=new Set(['ember','electric','ghost','prism','shadow','mint']);
const categories=new Set(['single','sealed']);
function validateProduct(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {error:'Invalid product'};
 const str=(key,max,required=false)=>{const val=raw[key];if(typeof val!=='string')throw Error(key+' must be text');const clean=val.trim();if(required&&!clean)throw Error(key+' is required');if(clean.length>max)throw Error(key+' is too long');return clean;};
 try{
  raw={theme:'mint',art:'',...raw};
  const cardMetadata=validateMetadata(raw.cardMetadata);

  const name=str('name',160,true),set=str('set',120,true),number=str('number',60),category=str('category',12,true),rarity=str('rarity',100),condition=str('condition',80),theme=str('theme',16),art=str('art',12),tag=str('tag',50),description=str('description',3000),imageUrl=str('imageUrl',500);
  if(!categories.has(category))throw Error('Invalid category');
  if(!themes.has(theme))throw Error('Invalid theme');
  if(typeof raw.price!=='number'||!Number.isFinite(raw.price)||raw.price<0||raw.price>1000000||Math.abs(Math.round(raw.price*100)-raw.price*100)>0.000001)throw Error('Price must be a valid ZAR amount with at most 2 decimals');
  if(!Number.isSafeInteger(raw.stock)||raw.stock<0||raw.stock>1000000)throw Error('Stock must be a nonnegative whole number');
  if(typeof raw.isPublished!=='boolean')throw Error('Publication status must be true or false');
  if(imageUrl){const u=new URL(imageUrl);if(u.protocol!=='https:')throw Error('Image URL must use HTTPS');}
  return {value:{name,set,number,category,rarity,condition,theme,art,tag,description,imageUrl,cardMetadata,priceCents:Math.round(raw.price*100),stock:raw.stock,isPublished:raw.isPublished}};
 }catch(err){return {error:err.message||'Invalid product'};}
}
module.exports={validateProduct};
