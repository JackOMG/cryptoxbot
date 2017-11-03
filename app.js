const restify = require('restify');
const builder = require('botbuilder');
const MongoClient = require('mongodb').MongoClient;
const Exchanges = require('crypto-exchange')
const _key          = '22022cff9b7442d6b2760bccf10edbfc'; // API Key
const _secret       = '64bc002ecc6f497fab76018472eb3baf'; // API Private Key

/*
var mysql      = require('mysql');
var connection = mysql.createConnection({
  host     : process.env.sqlhost || 'localhost',
  user     : process.env.sqluser || 'root',
  password : process.env.sqlpass || 'vertrigo',
  database : process.env.sqldb || 'redpromotions'
});
connection.connect();

setInterval(function () {
    connection.query('SELECT 1');
}, 5000);
*/

global.db=null; //database handle
MongoClient.connect(process.env.mongoConnect||"mongodb://localhost:27017", function(err, database) {
  if(!err) {
    console.log("DB connected");
	//Create a inventory
	db = database;
  } else console.log(err.stack);
});

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.AppId,
    appPassword: process.env.AppPassword,
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

//=========================================================
// Bots Middleware
//=========================================================

// Anytime the major version is incremented any existing conversations will be restarted.
bot.use(builder.Middleware.dialogVersion({ version: 1.0, resetCommand: /^reset/i }));

//=========================================================
// Bots Global Actions
//=========================================================

bot.endConversationAction('goodbye', 'Goodbye :)', { matches: /^goodbye/i });
//bot.beginDialogAction('search','/search', { matches: /^search/i });
//bot.beginDialogAction('account','/account','my account', { matches: /^account/i });


//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/', [
    function (session) {
        session.send("Hi... I'm the Crypto X Bot. I can help you buy your crypto currencies");
        session.beginDialog('/start');
    },
    function (session, results) {
        // Always say goodbye
        session.send("Ok... See you later!");
    }
]);

bot.dialog('/start', [
    function (session) {	
        builder.Prompts.choice(session, "What can I do for you?", "buy|sell|account");
    },
    function (session, results) {
		console.log('results:'+results.response.entity)
        if (results.response && results.response.entity != '(quit)') {
            // Launch demo dialog
            session.beginDialog('/' + results.response.entity);
        } else {
            // Exit the menu
            session.endDialog();
        }
    },
    function (session, results) {
        // The menu runs a loop until the user chooses to (quit).
        session.replaceDialog('/start');
    }
]).reloadAction('reloadMenu', null, { matches: /^start|show menu/i });

bot.dialog('/buy', [
    function (session) {
		session.userData.trade = "B"
		checkBalance(session);
	}		
]).triggerAction({matches: /^(B|b)uy$/});

function checkBalance(session) {
	// find the balance for this user
	db.collection('balances').findOne({userId: session.message.user.id, currency: "USD"}, function(err, user) {
		if (err) console.log(err)
		if (user) {
			session.send('Your balance is: ' + user.balance+ ' USD')
			session.userData.balance = user.balance
			session.beginDialog('/trade')
		}
		else {
			// give a new user a balnce of $10,000
			db.collection('balances').insertOne({userId: session.message.address.user.id,
				currency: "USD",
				balance: 10000
				})	
			session.send('As a new user you have been given a balnce of: 10,000 USD')
			session.userData.balance = 10000
			session.beginDialog('/trade')
			/*
			session.send('You dont have enough balance available. Please make a deposit first')
			session.beginDialog('/start')
			*/
		}
	})
	
}

bot.dialog('getPrice', [
    function (session,args) {	
		var msg = "At what price would you like to buy? Enter 0 for marketorder."
		if (args && args.reprompt) {
			if (args.reprompt == "neg") var msg = 'Price can not be negative. ' + msg
			if (args.reprompt == "bal") var msg = 'Total order value exceeds your balance. ' + msg
		}
		builder.Prompts.text(session, msg);
	},
	function(session, results) {
		if (results.response < 0) {
			session.replaceDialog('getPrice', { reprompt: "neg" });
		} else {
			if (results.response == 0) 
				session.userData.orderType = 'M'
			else {
				session.userData.orderType = 'L'
				session.userData.price = results.response
			}
			session.replaceDialog('getvolume')
			//builder.Prompts.number(session, "What volume?");
			//session.endDialogWithResult({ response: results.response });
		}
	}	
])

bot.dialog('getvolume', [
    function (session, args) {	
		if (args && args.reprompt) {
			if (args.reprompt == "neg") session.send('Amount has to be positive.')
		}
		builder.Prompts.text(session, 'What amount would you like to buy?');
	},
	function(session, results) {
		session.userData.volume = results.response;
		if (results.response <= 0) 
			session.replaceDialog('getvolume', { reprompt: "neg" })
		else {	
			var totalOrderAmount = session.userData.volume * session.userData.price
			// totalOrderAmount can not exceed balance
			if (totalOrderAmount > session.userData.balance)
				session.replaceDialog('getPrice', { reprompt: "bal" });
			else	
				session.endDialogWithResult({ response: results.response })
		}
	}	
])

bot.dialog('/trade', [
    function (session) {	
		builder.Prompts.text(session, "What crypto (BTC/ETH) would you like to buy?");
	},
	function(session, results) {
		session.userData.currency = results.response;
		var pair = results.response + '_USD'
		Exchanges.kraken.ticker(pair)
			.then(function (text) {
				console.log(text)
				for (var i in text) {
					session.send('Price is currently: '+text[i].ask + ' USD')
					session.userData.price = text[i].ask
				}
				session.beginDialog('getPrice');
		})
    }, 	
	function(session, results) {
		//var buyprice = session.userData.price ? session.userData.price : session.userData.marketprice
		var confirm = 'Please confirm that you want to BUY '+session.userData.volume+' '+session.userData.currency+ ' at $'+session.userData.price +' Total: $'+ session.userData.volume * session.userData.price
		builder.Prompts.confirm(session, confirm);
    },	
    function (session, results) {
		if (results.response) var msg = 'Thank you. Your order has been placed'
		else var msg = 'OK, Your order has been cancelled'
		processOrder(session)
        session.endConversation(msg);
		session.beginDialog('/start')
	}			
])

function processOrder(session) {

	var buyprice = (session.userData.price ? session.userData.price : session.userData.marketprice)
	var amount = session.userData.volume * buyprice
	var vol = session.userData.volume *1

	// process marketorders directly
	if (session.userData.orderType == 'M') {
		console.log('process market order')
		db.collection('trades').insertOne({userId: session.message.address.user.id, 
				userName: session.message.address.user.name, 
				date:(new Date()).getTime(),
				currency: session.userData.currency,
				price: session.userData.price,
				volume: vol,
				amount: amount,
				ordertype: session.userData.orderType
				})	
		//update balances
		db.collection('balances').updateOne({userId:  session.message.address.user.id, currency: "USD"}, {$inc: {balance: -amount}});
		db.collection('balances').update({userId:  session.message.address.user.id, currency: session.userData.currency}, {$inc: {balance: vol}}, { upsert: true });		
	} else {
		// process limit orders later
		console.log('process limit order')
		db.collection('orders').insertOne({userId: session.message.address.user.id, 
			userName: session.message.address.user.name, 
            date:(new Date()).getTime(),
			currency: session.userData.currency,
			price: session.userData.price,
			volume: vol,
            amount: amount,
			ordertype: session.userData.orderType
			})
	}
	
}

bot.dialog('/sell', [
    function (session) {
		builder.Prompts.text(session, "What crypto (BTC/ETH) would you like to sell?");
	},
	function(session, results) {
		session.userData.crypto = results.response;
		builder.Prompts.number(session, "What price in USD?");
    }, 
	function(session, results) {
		session.userData.price = results.response;
		builder.Prompts.number(session, "What volume?");
    }, 	
	function(session, results) {
		session.userData.volume = results.response;
	var confirm = 'Please confirm that you want to BUY '+session.userData.volume+' '+session.userData.crypto+ ' at $'+session.userData.price
		builder.Prompts.confirm(session, confirm);
    },	
    function (session, results) {
        session.endConversation("You chose '%s'", results.response ? 'yes' : 'no');
		session.beginDialog('/start')
	}			
]).triggerAction({matches: /^(S|s)ell$/});

bot.dialog('/db', [
    function (session) {
		builder.Prompts.text(session, "Database entry");             
		db.collection('users').findOne({userId: session.message.user.id}, function(err, user) {
			if (err) console.log(err)
			console.log('User:%j', user)
		})
		db.collection('balances').find({userId: session.message.user.id}).toArray(function(err, balances) {
			for (i in balances) {
				console.log(balances[i].currency + ':'+balances[i].balance)
			}
		})
		//update
		//db.collection('balances').updateOne({userId: session.message.user.id, currency: "USDt"}, {$set: {balance: 6000}});
		
		//insert
		db.collection('balances').insertOne({userId: session.message.user.id, currency: "USD", balance: 10000})
	},
    function (session, results) {
        session.endConversation("You chose '%s'", results.response ? 'yes' : 'no');
		session.beginDialog('/start')
	}			
]).triggerAction({matches: /^(D|d)b$/});

