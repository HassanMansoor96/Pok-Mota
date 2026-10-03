'use strict';
const {createPool}=require('./database-config');
module.exports=createPool(process.env.DATABASE_URL);
