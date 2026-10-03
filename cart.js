(() => {
 'use strict';const key='pokemota-cart-v1',uuid=/^[0-9a-f-]{36}$/i;
 function read(){try{const x=JSON.parse(localStorage.getItem(key)??localStorage.getItem('pokemota-demo-cart')??'{}');if(!x||typeof x!=='object'||Array.isArray(x))return {};return Object.fromEntries(Object.entries(x).filter(([id,q])=>uuid.test(id)&&Number.isInteger(q)&&q>0&&q<=99));}catch{return {};}}
 function write(value){try{localStorage.setItem(key,JSON.stringify(value));}catch{throw Error('Your browser could not save the bag. Allow site storage and try again.');}}
 function add(product){const cart=read();cart[product.id]=Math.min(99,product.stock,(cart[product.id]||0)+1);if(cart[product.id]>0)write(cart);}
 window.PokemotaCart={read,write,add};
})();
