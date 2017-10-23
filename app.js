const restify = require('restify');
const builder = require('botbuilder');

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
		builder.Prompts.text(session, "What crypto (BTC/ETH) would you like to buy?");
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
]).triggerAction({matches: /^(B|b)uy$/});

