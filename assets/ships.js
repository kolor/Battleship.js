var socket, game, chat;
var assets = {images: [], sounds: []}

var nw = {init: window.webkitNotifications, timer: null, msg: '', title: '', ex: null, icon: 'http://dev.chromium.org/_/rsrc/1220198801738/config/app/images/customLogo/customLogo.gif', show: function(){
	var pop = nw.init.createNotification(nw.icon, nw.title, nw.msg);
	pop.ondisplay = function() {
		setTimeout(function(){
			pop.cancel();
			pop = null;
		},3000);
	};
	pop.show();
}}

$(function() {
	checkSupport();
	$('canvas').hide();
	connectServer();
	$(window).unload(function(){
		socket.close();
	});		
});


/* Chat class
 *
 */

function Chat() {	
	this.getData = function(j) {
		if (j.msg && j.msg.length)
			$('#side .chat .text').append('<p><b>Opp</b>: '+j.msg+'</p>');	
	}
	
	var say = function(e) {
		if (e.keyCode != '13') return;
		var msg = $('#side .chat input').val();
		$('#side .chat .text').append('<p><b>You</b>: '+msg+'</p>');
		var str = '{"action":"chat","msg":"'+msg+'"}';
		send(str);	
	}
	
	var init = function() {
		$('#side .chat input').keyup(say);
	}();
}


function Game(c1,c2,info) {

/*
*	const: BOARD_WIDTH, BOARD_HEIGHT, PIECE_WIDTH, PIECE_HEIGHT
* gfx: canvas, cx1, cx2
* boolean: combo, canplay
* ships & setup: [{size,orientation,position[row,column]}]
* own & enemy: arr[10][10] val: 0=empty,1=miss,2=exists,3=shot
* 
*/

	var BOARD_WIDTH = 10, BOARD_HEIGHT = 10, PIECE_WIDTH = 24, PIECE_HEIGHT = 24;
	var canvas, cx1, cx2, canplay = false, combo, timer, setup = [];
	var ships = [], own = [], enemy = [];
	var shot = lost = 0;
	
	/*-- assets --*/
	assets.sounds.pop = document.createElement('audio'); 
	assets.sounds.pop.setAttribute('src','http://games.airy.me/battleships/assets/audio/pop.mp3');
	assets.sounds.pop.load();
	assets.sounds.expl = document.createElement('audio'); 
	assets.sounds.expl.setAttribute('src','http://games.airy.me/battleships/assets/audio/explosion.mp3');
	assets.sounds.expl.load();
	
	var init = function() {
		c1.width = c2.width = BOARD_WIDTH * PIECE_WIDTH;
		c1.height = c2.height = BOARD_HEIGHT * PIECE_HEIGHT;
		cx1 = c1.getContext('2d');
		cx2 = c2.getContext('2d');	
		$(c1).show();
		drawBoard(cx1);
		$('#side .lobby, #side .newgame').slideUp(function(){
			$('#side .chat').slideDown();
			$('#main .status button').show();
		});
	}
	
	var loadImages = function(s) {
		var progress = 0;
		
		var onImageLoaded = function(e) {
			progress += 100/assets.images.length;
			$(info).text('Loading.. '+progress+'%');
			if (progress > 99)
				newGame();
		}
		
		for(var i=0; i<2; i++) {
			assets.images[i] = new Image();
			$(assets.images[i]).bind('load', onImageLoaded);
		}
		assets.images[0].src = 'http://games.airy.me/battleships/assets/img/ship.png'; // ship
		assets.images[1].src = 'http://games.airy.me/battleships/assets/img/explosion.png'; // expl		
	}
	
	var Cell = function(row, column, status) {
		this.row = row;
		this.column = column;
		this.status = status;
	}
	
	this.getData = function(j) {
		if (j.type == 'create') onCreated(j);
		if (j.type == 'join') onJoin(j);
		if (j.type == 'joined') onJoined(j);
		if (j.type == 'start') onStart(j);
		if (j.type == 'move') onMove(j);
		if (j.type == 'moved') onMoved(j);
		if (j.type == 'end') onEnd(j);
		if (j.type == 'gameover') onGameOver(j);
	}
	
	var onCreated = function(j) {
		$(info).text('Wait for Player 2');
	}
	
	var onJoin = function(j) {
		loadImages();
	}
	
	var onJoined = function(j) {
		loadImages();
	}
	
	var onStart = function(j) {
		canplay = (j.canplay == 'true');
		$(c2).show();
		$(c2).click(boardClicked);
		drawBoard(cx2);
		if (canplay) {
			$(info).text('Your turn');
		}	
	}
	
	var onMove = function(j) {
		var r = parseInt(j.cell[0]);
		var c = parseInt(j.cell[1]);

		if (j.killed == 'true') {
			if (enemy[r][c-1] == 3 || enemy[r][c+1] == 3) killShip(0, j.cell);
			else
			if (enemy[r-1] && enemy[r-1][c] == 3 || enemy[r+1] && enemy[r+1][c] == 3) killShip(1, j.cell);
			else killShip(2, j.cell);
			shot++;
			$('#kills').text('Kills: '+ shot);
			assets.sounds.expl.play();
		}

		updateEnemy(j.cell, j.res);		
		canplay = (j.canplay == 'true');
		
		if ((j.won == 'true' && j.who == 'you') || shot == 9) {
			$(info).text('You won');
			return;
		}	
		
		if (canplay)
			$(info).text('Your turn');
		else 
			$(info).text('Please wait');		
	}
	
	var onMoved = function(j) {

		updateOwn(j.cell, j.res);
		canplay = (j.canplay == 'false');
		
		if (j.killed == 'true') {
			lost++;
			$('#lost').text('Lost: '+lost);
			assets.sounds.expl.play();
		}
		
		if ((j.won == 'true' && j.who != 'you') || lost == 9) {
			$(info).text('You lost');
			return;
		}		
		if (canplay) {
			assets.sounds.pop.play();
			$(info).text('Your turn');
		}
	}
	
	var onEnd = function(j) {
		lobby = new Lobby();
	}
	
	var onGameOver = function(j) {
		if (j.who == 'you') {
			$(info).text('You won');
		} else {
			$(info).text('You lost');
		}
	}
	
	var newGame = function() {
		ships.splice(0, ships.length);
		drawBoard(cx1);
		$(info).text('Setup ships');
		setupBoard();		
	}
	
	var setupBoard = function() {
		$(c1).click(setupShip);
		$(c1).bind('contextmenu',changeOrient);
		$(c1).mousemove(setupBoardHover);
		setup = [{s:4,o:0},{s:3,o:0},{s:3,o:0},{s:2,o:0},{s:2,o:0},{s:2,o:0},{s:1,o:0},{s:1,o:0},{s:1,o:0}]; // 0 - horz; 1 - vert
		own = [[],[],[],[],[],[],[],[],[],[]];
		for(var i=0; i<10; i++) 
			for(var j=0; j<10; j++)
				own[i][j] = 0;
		enemy = [[],[],[],[],[],[],[],[],[],[]];
			for(var i=0; i<10; i++) 
				for(var j=0; j<10; j++)
					enemy[i][j] = 0;
		
	}

	var setupBoardHover = function(e) {
		var cell = getPosition(e, c1);
		if (setup.length == 0) return;
		if (cell.column < 0 || cell.row < 0 || cell.column > 9 || cell.row > 9) return;
		var size = setup[0].s;
		var orn = setup[0].o;
		drawBoard(cx1);
		drawShips(cx1, own);	
		setup[0].p = [];
		if (orn == 0) {
			if (cell.column + size > BOARD_WIDTH) {
				for(var i=0; i<size; i++) {
					if (own[cell.row][BOARD_WIDTH-i-1] > 0) {
						delete setup[0].p;
						drawBoard(cx1);
						drawShips(cx1, own);	
						return;
					}
					setup[0].p.push({row:cell.row, column: BOARD_WIDTH-i-1});				
					drawCell(cx1, {row:cell.row, column: BOARD_WIDTH-i-1});
				}
					
			} else {
				for(var i=0; i<size; i++) {
					if (own[cell.row][cell.column+i] > 0) {
						delete setup[0].p;
						drawBoard(cx1);
						drawShips(cx1, own);
						return;
					}
					setup[0].p.push({row:cell.row, column: cell.column+i});							
					drawCell(cx1, {row:cell.row, column: cell.column+i});
				}
					
			}
		} else if (orn == 1) {
			if (cell.row + size > BOARD_HEIGHT) {
				for(var i=0; i<size; i++) {
					if (own[BOARD_HEIGHT-i-1][cell.column] > 0) {
						delete setup[0].p;
						drawBoard(cx1);
						drawShips(cx1, own);
						return;
					}
					setup[0].p.push({row:BOARD_HEIGHT-i-1, column: cell.column});				
					drawCell(cx1, {row:BOARD_HEIGHT-i-1, column: cell.column});
				}
					
			} else {
				for(var i=0; i<size; i++) {
					if (own[cell.row+i][cell.column] > 0) {
						delete setup[0].p;
						drawBoard(cx1);
						drawShips(cx1, own);
						return;
					}
					setup[0].p.push({row:cell.row+i, column: cell.column});							
					drawCell(cx1, {row:cell.row+i, column: cell.column});
				}
					
			}
		}		
	}
	
	var changeOrient = function(e) {
		setup[0].o = abs(setup[0].o-1);
		e.preventDefault();
		setupBoardHover(e);		
	}
	
	var setupShip = function(e) {
		if (setup.length == 0 || typeof setup[0].p == 'undefined') return;
		var ship = setup.shift();
		ships.push(ship);
				
		if (ship.o == 0) {
			var row = ship.p[0].row;
			var arr = [];
			for(var k in ship.p)
				arr.push(ship.p[k].column);
			
			for(var i=row-1; i<=row+1; i++) {
				for(var j=min(arr)-1; j<=max(arr)+1; j++) {
					if (i<0 || j<0 || i>9 || j>9) continue;
					own[i][j] = 1;				
				}			
			}
		} else if (ship.o == 1) {
			var col = ship.p[0].column;
			var arr = [];
			for(var k in ship.p)
				arr.push(ship.p[k].row);
			
			for(var i=min(arr)-1; i<=max(arr)+1; i++) {
				for(var j=col-1; j<=col+1; j++) {
					if (i<0 || j<0 || i>9 || j>9) continue;
					own[i][j] = 1;				
				}			
			}
		}

		for(var i=0; i<ship.p.length; i++) {
			own[ship.p[i].row][ship.p[i].column] = 2;		
		}
			
		if (setup.length == 0) {
			startGame();
			$(c1).unbind('click');
			$(c1).unbind('contextmenu');
			$(c1).unbind('mousemove');
		}	
		drawShips(cx1, own);		
	}
	
	var startGame = function() {
		$(info).text('Waiting for P2');
		var str = {"action":"start",board:own};
		send(JSON.stringify(str));
	}
	
	var boardClicked = function(e) {
		if (!canplay) return;
		var cell = getPosition(e, c2);
		send(encodePosition(cell));
	}

	
	var getPosition = function(e, canvas) {
		x = e.pageX - $(canvas).offset().left - 2;
		y = e.pageY - $(canvas).offset().top -2;
		x = Math.min(x, BOARD_WIDTH * PIECE_WIDTH);
    y = Math.min(y, BOARD_WIDTH * PIECE_WIDTH);
		var cell = new Cell(Math.floor(y/PIECE_HEIGHT), Math.floor(x/PIECE_WIDTH), 0);
		return cell;
	}
	
	var encodePosition = function(cell) {
		var str = '{"row":"'+cell.row+'","column":"'+cell.column+'","action":"move"}';
		return str;
	}
	
	var updateEnemy = function(cell, res) {
		var r = parseInt(cell[0]);
		var c = parseInt(cell[1]);
		enemy[r][c] = res;
		drawBoard(cx2);
		drawShips(cx2, enemy);
	}
	
	var updateOwn = function(cell, res) {
		var r = parseInt(cell[0]);
		var c = parseInt(cell[1]);
		own[r][c] = res;
		drawBoard(cx1);
		drawShips(cx1, own);
	}
			
	var killShip = function(dir, cell) {
		var r = parseInt(cell[0]);
		var c = parseInt(cell[1]);
		
		if (dir == 0) {  // moving horizontally
			if (r>0) enemy[r-1][c] = 1;
			if (r<9) enemy[r+1][c] = 1;			
			for (var i=1;i<5; i++) { // moving right
				if (c+i > 9) break;
				if (r>0) enemy[r-1][c+i] = 1;
				if (r<9) enemy[r+1][c+i] = 1;	
				if (enemy[r][c+i] != 3) { 
					enemy[r][c+i] = 1;
					break;
				}
			}
			
			for (var i=1;i<5; i++) { // moving left
				if (c-i < 0) break;
				if (r>0) enemy[r-1][c-i] =  1;
				if (r<9) enemy[r+1][c-i] = 1;	
				if (enemy[r][c-i] != 3) {
					enemy[r][c-i] = 1;
					break;
				}
			}			
		} else if (dir == 1) {  // moving vertically
			if (c>0) enemy[r][c-1] = 1; 
			if (c<9) enemy[r][c+1] = 1;			
			for (var i=1;i<5; i++) { // moving up
				if (r-i < 0) break;
				if (c>0) enemy[r-i][c-1] = 1;
				if (c<9) enemy[r-i][c+1] = 1;	
				if (enemy[r-i][c] != 3) {
					enemy[r-i][c] = 1;
					break;
				}
			}
			
			for (var i=1;i<5; i++) { // moving down
				if (r+i > 9) break;
				if (c>0) enemy[r+i][c-1] = 1;
				if (c<9) enemy[r+i][c+1] = 1;	
				if (enemy[r+i][c] != 3) {
					enemy[r+i][c] = 1;
					break;
				}
			}		
		} else if (dir == 2) {
			if (r>0) { // previous row
				if (c>0) enemy[r-1][c-1] = 1;
				enemy[r-1][c] = 1;
				if (c<9) enemy[r-1][c+1] = 1;
			}
			if (c>0) enemy[r][c-1] = 1;
			if (c<9) enemy[r][c+1] = 1;
			if (r<9) {
				if (c>0) enemy[r+1][c-1] = 1;
				enemy[r+1][c] = 1;
				if (c<9) enemy[r+1][c+1] = 1;
			}
	
		}
	}
	
	var drawBoard = function(ctx) {
		var cwidth = 1 + (BOARD_WIDTH * PIECE_WIDTH), cheight = 1 + (BOARD_HEIGHT * PIECE_HEIGHT);	
		ctx.clearRect(0,0, cwidth, cheight);
		return; 
		
		ctx.beginPath();
		
		for (var x=0; x<= cwidth; x+= PIECE_WIDTH) {
			ctx.moveTo(0.5+x,0);
			ctx.lineTo(0.5+x,cheight);
		}
		
		for (var y=0; y<= cheight; y+= PIECE_HEIGHT) {
			ctx.moveTo(0, 0.5+y);
			ctx.lineTo(cwidth, 0.5+y);
		}

		ctx.strokeStyle = '#7b8ec5';
		ctx.stroke();
	}
		
	var drawShips = function(ctx, arr) {
		for(var i=0; i<arr.length; i++) { 
			for(var j=0; j<arr[i].length; j++) { 
				var x0 = j*PIECE_WIDTH;
				var y0 = i*PIECE_HEIGHT;
				var x = x0 + PIECE_WIDTH/2;
				var y = y0 + PIECE_HEIGHT/2;
				var r = (PIECE_WIDTH/2) - (PIECE_WIDTH/10);
				
				if (arr[i][j] == 0) {

				} else
				if (arr[i][j] == 1) { // missed
					ctx.beginPath();
					ctx.arc(x,y,r/6,0,Math.PI*2,false);
					ctx.closePath();
					
					ctx.strokeStyle ='#162a59';
					ctx.stroke();
					ctx.fillStyle ='#162a59';
					ctx.fill();
					
				} else
				if (arr[i][j] == 2) {// alive ship
					ctx.beginPath();
					ctx.drawImage(assets.images[0], x0, y0);
					ctx.closePath();
				} else
				if (arr[i][j] == 3) { // cross: shot
					ctx.beginPath();
					ctx.drawImage(assets.images[1], x0, y0);
					ctx.closePath();
				} 
			}
		}
	
	}
	
	var drawCell = function(ctx, cell) {
		var col = cell.column;
		var row = cell.row;
		var x = (col*PIECE_WIDTH)+(PIECE_WIDTH/2);
		var y = (row*PIECE_HEIGHT)+(PIECE_HEIGHT/2);
		var r = (PIECE_WIDTH/2) - (PIECE_WIDTH/10);
		ctx.beginPath();
		ctx.arc(x,y,r,0,Math.PI*2,false);
		ctx.closePath();
		ctx.strokeStyle ='#162a59';
		ctx.stroke();
	}
	
	init();
}

function Lobby() {

	this.getData = function(j) {
		if (j.type == 'listGames') listGames(j);
		if (j.type == 'newgame') onNewGame(j);
	}
	
	var listGames = function(j) {
		if (j.games.length > 0) {
			$('.games').find('h3').remove();
			for(var i=0; i<j.games.length; i++) {
				if (j.games[i][2] == '1')
					$('#side .games').append('<div class="game open" data-id="'+j.games[i][0]+'">'+j.games[i][1]+' (1 P)</div>');
				if (j.games[i][2] == '2')
					$('#side .games').append('<div class="game closed" data-id="'+j.games[i][0]+'">'+j.games[i][1]+' (2 P)</div>');
			}
		} else 
			$('#side .games').html('<h3>No games found</h3>');	
	}
	
	var createGame = function() {
		var t = $('.buttons input').val() || 'Just game';
		game = new Game($('#c1')[0],$('#c2')[0],$('.info')[0]);
		send('{"action":"create","title":"'+t+'"}');
	}
	
	var onNewGame = function(j) {
		$('.info').text('Select game');
		$('.games h3').remove();
		$('.games').append('<div class="game open" data-id="'+j.games[0]+'">'+j.games[1]+' (1 player)</div>');
	}
	
	var joinGame = function(e) {
		var id = $(this).attr('data-id');
		game = new Game($('#c1')[0],$('#c2')[0],$('.info')[0]);
		send('{"action":"join","game":"'+id+'"}');
	}
	
	var quitGame = function() {
	
	
	
	}	
	
	var init = function() {
		$('#side .newgame button').click(createGame);
		$('#side .games .game.open').live('click',joinGame);
		$('#main .status button.quit').click(quitGame);
		send('{"action":"listGames"}');
	}
	
	setTimeout(init, 1000);
}

function connectServer() {
	var host = "ws://webapi.us:3002";
	try {
		socket = new WebSocket(host);
		socket.onopen    = onConnected;
		socket.onmessage = onDataReceived;
		socket.onclose   = onDisconnect;
	} catch(ex) {
		return;
	}
}

function send(data) {
	try {socket.send(data);} 
	catch(exception) {return;}
}

function onConnected() {
	send('{"action":"test"}');
	lobby = new Lobby();
	chat = new Chat();
}

function onDataReceived(msg) {
	try {var j = $.parseJSON(msg.data);} 
		catch(err) {return console.log(err);}
	if (j.dest == 'lobby')
		lobby.getData(j);
	if (j.dest == 'game')
		game.getData(j);

}

function onDisconnect() {
	$('.info').text('Lost connection to server. Please try again later.');
}

function notify(msg) {
	if (!window.webkitNotifications) return;
	nw.title =  'Battleships';
	nw.msg = msg;
	if(!nw.init.checkPermission()) { nw.show(); } 	
}


function checkSupport() {
	if (!Modernizr.websockets || !Modernizr.canvas) {
		$('body').append('<div id="overlay"><div class="info"></div></div>');
		$('#overlay .info').html('<h1>Your browser is outdated!</h1>\
		    <p>Your browser does not support <b>websockets</b> or <b>canvas</b>.</p>\
            <p>Please grab supported browser from one of the vendors below:</p>\
			<div class="browsers"><a href="http://www.google.com/chrome/" target="_blank"><div class="chrome"></div></a>\
			<a href="http://www.apple.com/safari" target="_blank"><div class="safari"></div></a>');
		return false;
	}
	return true;	
}