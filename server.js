//-----------------------Imports ---////
const express = require('express');
const session = require('express-session');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
const mariadb = require('mariadb');
const redis = require('redis');
const redisClient = redis.createClient();
const md5 = require('md5');
const redisStore = require('connect-redis')(session);
const cors=require('cors');
const uuidParse = require('uuid-parse');
//------------------Global variable declaration & connections

const pool = mariadb.createPool({host: '127.0.0.1', user: 'ticketing',password:'ticketapp', database:'czcrm_generic',connectionLimit: 5});
const {
	PORT=3030
}=process.env
const app=express();

//-------------Connection modules with express
//app.use(json())
app.use(bodyParser.json())
app.use(cookieParser());
app.use('/*',session({
    secret: 'ThisisTestSecretForCookie',
    // create new redis store.
	name: 'nodeSessID',
	store: new redisStore({host: 'localhost', port: 6379, client: redisClient,ttl :  260}),
    saveUninitialized: false,
	resave: false,
	cookie: { secure: false,domain:'cz-tuts.com',path: '/',maxAge:24*60*60*1000 },
}));

app.use(cors({
	origin: 'http://app.cz-tuts.com',
	credentials:true,
	methods:['GET','POST','OPTIONS'],
	allowedHeaders:'Content-type,Accept,X-Access-Token,X-Key,X-KeepAlive',
	optionsSuccessStatus: 200
  }));

//---------------------Function to perform DB operation on register User 
async function registerUser(params){
	let conn;
	try {
		conn = await pool.getConnection();
		////--------------------Cleint registration Entry
		const resRegUUID=await conn.query("SELECT UUID() as UUID");
		let regUUID=resRegUUID[0].UUID;
		var query=`INSERT into clientRegistrationBasic (registrationID,fullName,email,phone,status)values(UuidToBin("${regUUID}"),"${params.name}","${params.email}","${params.mobile}","VERIFIED")`;
		const resRegistration = await conn.query(query);
		
		//-----------------Entry in client details
		const resClientUUID=await conn.query("SELECT UUID() as UUID");
		let clientUUID=resClientUUID[0].UUID;
		var query1=`INSERT INTO clientDetails (clientID,clientName,email,phone,status,registrationID) value (UuidToBin("${clientUUID}"),"${params.name}","${params.email}","${params.mobile}",1,UuidToBin("${regUUID}"))`
		const resClient = await conn.query(query1);
		
		//-----Entry in Auth Table
		const resAuthUUID=await conn.query("SELECT UUID() as UUID");
		let authUUID=resAuthUUID[0].UUID;	
		query2=`INSERT INTO userAuth (userID,userName,email,phone,password,clientID) value (UuidToBin("${authUUID}"),"${params.name}","${params.email}","${params.mobile}","${md5(params.password)}",UuidToBin("${clientUUID}"))`;
		const resAuth = await conn.query(query2);
		
		conn.end();//---Disconnect DB
		return {status:1,message:"User Added Successfully!!"}; 

	  } catch (err) {
		  
		  conn.end();
		return {status:0,message:"Currently unavailable !!"}; 
	  } 

 }

 //-------------_Function to fetch USer dtata 
 async function fetchUser(email){
	let conn;
	try {
		conn = await pool.getConnection();
		
		query=`SELECT UuidFromBin(userID) as userID,userName,email,phone,password,UuidFromBin(clientID) as clientID from userAuth WHERE email like '${email}'`;
		const resAuth = await conn.query(query);
		conn.end();
		
		return resAuth; 

	  } catch (err) {
		  
		conn.end();
		return 0; 
	  } 
 }
//--------Handling CORS--///
  app.options('*', cors(),function(res,req,next){
	  next();
  });

  //--------------API Routes ---------
app.post('/login',(req,res, next)=>{
	//console.log(req.body);
	const {email,password}=req.body
   	if(email && password){
		fetchUser(email).then(user=>{
			
				if(user){
				
					if(user[0].password==md5(password)){
						//console.log(user);
						req.session.key=email;   
						req.session.userID=uuidParse.unparse(user[0].userID);
						req.session.clientID=uuidParse.unparse(user[0].clientID);

						res.cookie('nodeSessID', req.sessionID, {maxAge: 24*60*60*1000,httpOnly:false,secure:false,domain:'cz-tuts.com',path:'/'}).json({status:1,message:"success",'nodeSessID':req.sessionID});
					}
					else{
						res.json({status:0,message:"Invalid email or password !!"});
					}
				}
				else{
					res.json({status:0,message:"User Not Exist!!"});
				}
			});


		}
		else{
			res.json({status:0,message:"Invalid Email or Password"}); 
		}
})

app.post('/register',(req,res, next)=>{
	
	
	const {email,password,name,mobile,repassword}=req.body
	if(email && password && mobile){
		registerUser({"name":name,"email":email,"mobile":mobile,"password":password,"repassword":repassword}).then(result=>res.json(result));
		//	res.json({status:1,message:"customer Added Successfully!!"})
	}else{
		res.json({status:0,message:"Required Parameter(s) Missing!!"}); 
	}
   
})

app.post('/dashboard',(req,res)=>{
//	console.log(req.session.clientID);
	
	if((typeof req.session.clientID)!='undefined' ){
	let JsonData=require('./static/dashboardApi.json');
	//console.log(JsonData);
	retData=JsonData[req.session.clientID];
	res.json({status:1,data:retData});
	}
	else{
		res.status('401').json({status:0,message:"Unauthorised Access!!"});
	}
	
})

app.post('/logout',(req,res)=>{
	if (req.session) {
		// delete session object
		req.session.destroy(function(err) {
		  if(err) {
			return next(err);
		  } else {
			return res.clearCookie('nodeSessID').json({status:0,message:"success"});
		  }
		});
	  }
	
})

app.listen(PORT,()=>console.log(
      `http://localhost:${PORT}`
	))
