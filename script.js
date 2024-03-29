var _mvMatrix = mat4.create();
var _pMatrix = mat4.create();

var _mvMatrixStack = [];

var _shadersToLoad = ["standard-shader"];
var _shaderPrograms = [];
var _currentShaderProgram = null;
var _gl;
var _canvas;
var _lastTime = 0;
var _rSquare = 0.0;

var _keysDown = {};

var _cameraPos = {x: 0, y: 0, z:70.0};

var _space = [];
var _spaceLimits = {x:50, y:50, z:1};
var _spaceFillPercent = 30;
var _spaceRot = { x:0, y:0, z:0 };
var _spaceRotPerSecond = { x:0, y:0, z:0 };
var _pStart = null;
var _pGoal = null;

var _wireframeObstacleCubeBuffers = null;
var _solidObstacleCubeBuffers = null;
var _wireframeSearchedCubeBuffers = null;
var _solidPathCubeBuffers = null;
var _solidStartCubeBuffers = null;
var _solidGoalCubeBuffers = null;

var _wireframeObstacles = false;

var _cubeSize = 1;
var _captureInput = false;

var _currentSearchAlgorithmName = "a_star";

var SPACE = Pathfinding.SPACE;
var OBSTACLE = Pathfinding.OBSTACLE;
var START = Pathfinding.START;
var GOAL = Pathfinding.GOAL;
var PATH = 5;

var pathfinding = new Pathfinding();

/* Startup funciton to set up the canvas */
var main = function()
{
	init();
	tick();
}

var init = function()
{
	initCanvas();
	initGL();
	initShaders();
	initSpace();
	initBuffers();
}

var initBuffers = function()
{
	_wireframeObstacleCubeBuffers = initWireframeCubeBuffers([0.5, 0.5, 0.5, 1.0]);
	_solidObstacleCubeBuffers = initSolidCubeBuffers([0.5, 0.5, 0.5, 1.0]);
	_wireframeSearchedCubeBuffers = initWireframeCubeBuffers([0.8, 0.8, 0.8, 1.0]);
	_solidPathCubeBuffers = initSolidCubeBuffers([1, 1, 1, 1.0]);
	_solidStartCubeBuffers = initSolidCubeBuffers([0.6, 0.6, 1, 1.0]);
	_solidGoalCubeBuffers = initSolidCubeBuffers([1, 0.6, 0.6, 1.0]);
}

var initSpace = function()
{
	_space = [];
	pathfinding = new Pathfinding();
	generateSpace(_spaceLimits.x, _spaceLimits.y, _spaceLimits.z);
	pathfinding.fnLoadAlgorithm(_currentSearchAlgorithmName);
	pathfinding.fnInitSearch();
}

var restartSearch = function()
{
	resetSpace();
	pathfinding.fnLoadAlgorithm(_currentSearchAlgorithmName);
	pathfinding.fnInitSearch();
}

var resetSpace = function()
{
	pathfinding = new Pathfinding();
	for(var x = 0; x < _space.length; ++x)
	{
		for(var y = 0; y < _space[x].length; ++y)
		{
			for(var z = 0; z < _space[x][y].length; ++z)
			{
				var type = _space[x][y][z];
				if(x == _pStart.x && y == _pStart.y && z == _pStart.z)
				{
					_space[x][y][z] = START;
				}
				else if(x == _pGoal.x && y == _pGoal.y && z == _pGoal.z)
				{
					_space[x][y][z] = GOAL;
				}
				else if(type != OBSTACLE)
				{
					_space[x][y][z] = SPACE;
				}
			}
		}
	}
	
	pathfinding.fnSetGraph(_space);
	pathfinding.fnSetStartPosition(_pStart);
	pathfinding.fnSetGoalPosition(_pGoal);
}

var initCanvas = function()
{
	_canvas = document.getElementById("gl_canvas");
	_canvas.height = _canvas.clientHeight;
	_canvas.width = _canvas.clientWidth;
}

var initGL = function()
{
	try
	{
		_gl = _canvas.getContext("experimental-webgl", {antialias: true});
		_gl.viewportWidth = _canvas.clientWidth;
		_gl.viewportHeight = _canvas.clientHeight;
		_gl.clearColor(0.0, 0.0, 0.0, 1.0);
        _gl.enable(_gl.DEPTH_TEST);
	}
	catch(e)
	{
		alert("Could not start WebGL: " + e);
		return false;
	}
	
	document.onkeydown = handleKeyDown;
	document.onkeyup = handleKeyUp;
}

var initShaders = function()
{
	for(var i = 0; i < _shadersToLoad.length; ++i)
	{
		var program = initShaderProgram(_shadersToLoad[i]);
		_shaderPrograms.push(program);
	}
	
	_currentShaderProgram = _shaderPrograms[0];
}

var wireframeObstacles = function(enable)
{
	_wireframeObstacles = enable;
}

var getShader = function(shaderID)
{
	var shaderScript = document.getElementById(shaderID);
	if(!shaderScript)
	{
		console.error("Could not find shader script '" + shaderID + "'");
		return null;
	}
	
	var shaderScriptSource = "";
	var child = shaderScript.firstChild;
	while(child)
	{
		if(child.nodeType == 3)
		{
			shaderScriptSource = shaderScriptSource + child.textContent;
		}
		
		child = child.nextSibling;
	}
	
	var shader;
	switch(shaderScript.type)
	{
		case "x-shader/x-fragment":
			shader = _gl.createShader(_gl.FRAGMENT_SHADER);
			break;
		case "x-shader/x-vertex":
			shader = _gl.createShader(_gl.VERTEX_SHADER);
			break;
		default:
			console.error("Unknown shader type '" + shaderScript.type + "' for shader '" + shaderID + "'");
			return null;
	}
	
	_gl.shaderSource(shader, shaderScriptSource);
	_gl.compileShader(shader);
	
	if(!_gl.getShaderParameter(shader, _gl.COMPILE_STATUS))
	{
		console.error("Error compiling shader '" + shaderID + "': " + _gl.getShaderInfoLog(shader));
		return null;
	}
	
	return shader;
}

var initShaderProgram = function(shaderType)
{
	var fragmentShader = getShader(shaderType + "-fs");
	if(fragmentShader == null)
	{
		return null;
	}
	
	var vertexShader = getShader(shaderType + "-vs");
	if(fragmentShader == null)
	{
		return null;
	}
	
	var shaderProgram = _gl.createProgram();
	_gl.attachShader(shaderProgram, vertexShader);
	_gl.attachShader(shaderProgram, fragmentShader);
	_gl.linkProgram(shaderProgram);
	
	if(!_gl.getProgramParameter(shaderProgram, _gl.LINK_STATUS))
	{
		console.error("Could not initialise shaders for shader type '" + shaderType + "'");
	}
	
	_gl.useProgram(shaderProgram);
	
	shaderProgram.vertexPositionAttribute = _gl.getAttribLocation(shaderProgram, "aVertexPosition");
	_gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
	
	shaderProgram.vertexColorAttribute = _gl.getAttribLocation(shaderProgram, "aVertexColor");
    _gl.enableVertexAttribArray(shaderProgram.vertexColorAttribute);
	
	shaderProgram.pMatrixUniform = _gl.getUniformLocation(shaderProgram, "uPMatrix");
	shaderProgram.mvMatrixUniform = _gl.getUniformLocation(shaderProgram, "uMVMatrix");
	
	return shaderProgram;
}

function mvPushMatrix() {
	var copy = mat4.clone(_mvMatrix);
	_mvMatrixStack.push(copy);
}

function mvPopMatrix() {
	if (_mvMatrixStack.length == 0) {
		throw "Invalid popMatrix!";
	}
	_mvMatrix = _mvMatrixStack.pop();
}

function degToRad(degrees) {
	return degrees * Math.PI / 180;
}

function animate() {
	var timeNow = new Date().getTime();
	if (_lastTime != 0) {
		var elapsed = timeNow - _lastTime;
		_rSquare += (75 * elapsed) / 1000.0;
		
		_spaceRot.x += _spaceRotPerSecond.x * (elapsed / 1000.0);
		_spaceRot.y += _spaceRotPerSecond.y * (elapsed / 1000.0);
		_spaceRot.z += _spaceRotPerSecond.z * (elapsed / 1000.0);
	}
	_lastTime = timeNow;
}

function handleKeyDown(event)
{
	if(!_captureInput)
		return;
	_keysDown[event.keyCode] = true;
	if(event.keyCode == 38 || event.keyCode == 40) return false;
}

function handleKeyUp(event)
{
	_keysDown[event.keyCode] = false;
}

var initWireframeCubeBuffers = function(cubeColor)
{
	if(cubeColor == undefined)
		cubeColor = [0.5, 0.5, 0.5, 1.0];
	var size = _cubeSize / 2;
	var squareVertexPositionBuffer = _gl.createBuffer();
	_gl.bindBuffer(_gl.ARRAY_BUFFER, squareVertexPositionBuffer);
	vertices = [
		/* Front Face */
		size, size, size,
		-size, size, size,
		-size, -size, size,
		size, -size, size,
		size, size, size,
		
		/* Right Face */
		size, size, -size,
		size, -size, -size,
		size, -size, size,
		size, -size, -size,
		
		/* Back Face */
		-size, -size, -size,
		-size, size, -size,
		size, size, -size,
		-size, size, -size,
		
		/* Left Face */
		-size, size, size,
		-size, -size, size,
		-size, -size, -size
		];
	_gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(vertices), _gl.STATIC_DRAW);
	squareVertexPositionBuffer.itemSize = 3;
	squareVertexPositionBuffer.numItems = Math.round(vertices.length / 3);

	squareVertexColorBuffer = _gl.createBuffer();
	_gl.bindBuffer(_gl.ARRAY_BUFFER, squareVertexColorBuffer);
	colors = []
	for (var i=0; i < squareVertexPositionBuffer.numItems; i++) {
		colors = colors.concat(cubeColor);
	}
	_gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(colors), _gl.STATIC_DRAW);
	squareVertexColorBuffer.itemSize = 4;
	squareVertexColorBuffer.numItems = 4;
	
	_gl.bindBuffer(_gl.ARRAY_BUFFER, squareVertexPositionBuffer);
	_gl.vertexAttribPointer(_currentShaderProgram.vertexPositionAttribute, squareVertexPositionBuffer.itemSize, _gl.FLOAT, false, 0, 0);
	
	_gl.bindBuffer(_gl.ARRAY_BUFFER, squareVertexColorBuffer);
    _gl.vertexAttribPointer(_currentShaderProgram.vertexColorAttribute, squareVertexColorBuffer.itemSize, _gl.FLOAT, false, 0, 0);
	
	return { 
		vBuffer: squareVertexPositionBuffer, 
		cBuffer: squareVertexColorBuffer, 
		primitive: _gl.LINE_STRIP 
	};
}

var initSolidCubeBuffers = function(cubeColor)
{
	var size = _cubeSize / 2;
	var vBuffer = _gl.createBuffer();
	_gl.bindBuffer(_gl.ARRAY_BUFFER, vBuffer);
	vertices = [
		size, size, size,
		-size, size, size,
		
		size, -size, size,
		-size, -size, size,
		
		-size, -size, -size,
		-size, size, size,
		
		-size, size, -size,
		size, size, size,
		
		size, size, -size,
		size, -size, size,
		
		size, -size, -size,
		-size, -size, -size,
		
		size, size, -size,
		-size, size, -size
		];
	_gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(vertices), _gl.STATIC_DRAW);
	vBuffer.itemSize = 3;
	vBuffer.numItems = Math.round(vertices.length / 3);

	cBuffer = _gl.createBuffer();
	_gl.bindBuffer(_gl.ARRAY_BUFFER, cBuffer);
	colors = []
	for (var i=0; i < vBuffer.numItems; i++) {
		colors = colors.concat(cubeColor);
	}
	_gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(colors), _gl.STATIC_DRAW);
	cBuffer.itemSize = 4;
	cBuffer.numItems = 4;
	
	_gl.bindBuffer(_gl.ARRAY_BUFFER, vBuffer);
	_gl.vertexAttribPointer(_currentShaderProgram.vertexPositionAttribute, vBuffer.itemSize, _gl.FLOAT, false, 0, 0);
	
	_gl.bindBuffer(_gl.ARRAY_BUFFER, cBuffer);
    _gl.vertexAttribPointer(_currentShaderProgram.vertexColorAttribute, cBuffer.itemSize, _gl.FLOAT, false, 0, 0);
	
	return { 
		vBuffer: vBuffer, 
		cBuffer: cBuffer, 
		primitive: _gl.TRIANGLE_STRIP
	};
}

var drawCube = function(cubePos, buffers)
{
	_gl.bindBuffer(_gl.ARRAY_BUFFER, buffers.vBuffer);
	_gl.vertexAttribPointer(_currentShaderProgram.vertexPositionAttribute, buffers.vBuffer.itemSize, _gl.FLOAT, false, 0, 0);
	
	_gl.bindBuffer(_gl.ARRAY_BUFFER, buffers.cBuffer);
	_gl.vertexAttribPointer(_currentShaderProgram.vertexColorAttribute, buffers.cBuffer.itemSize, _gl.FLOAT, false, 0, 0);

	var size = _cubeSize / 2;
	mvPushMatrix();
		mat4.translate(_mvMatrix, _mvMatrix, [cubePos.x * _cubeSize, cubePos.y * _cubeSize, cubePos.z * _cubeSize]);
		mvPushMatrix();
			_gl.uniformMatrix4fv(_currentShaderProgram.pMatrixUniform, false, _pMatrix);
			_gl.uniformMatrix4fv(_currentShaderProgram.mvMatrixUniform, false, _mvMatrix);
	
			_gl.drawArrays(buffers.primitive, 0, buffers.vBuffer.numItems);
		mvPopMatrix();
	mvPopMatrix();
}
if(window.Event) window.captureEvents(Event.KEYDOWN);
function updateInput()
{
	if(_keysDown[65])
		_cameraPos.x -= 1.0;
	
	if(_keysDown[68])
		_cameraPos.x += 1.0;
	
	if(_keysDown[87])
		_cameraPos.z -= 1.0;
	
	if(_keysDown[83])
		_cameraPos.z += 1.0;
	
	if(_keysDown[69])
		_cameraPos.y += 1.0;
	
	if(_keysDown[81])
		_cameraPos.y -= 1.0;
		
	var maxRotPerSecond = 3;
	var addedRotPerSecond = 0.02;
	if(_keysDown[37])
	{
		if(_spaceRotPerSecond.y + addedRotPerSecond <= maxRotPerSecond)
		{
			_spaceRotPerSecond.y += addedRotPerSecond;
		}
	}
	
	if(_keysDown[39])
	{
		if(_spaceRotPerSecond.y - addedRotPerSecond >= -maxRotPerSecond)
			_spaceRotPerSecond.y -= addedRotPerSecond;
	}
	
	if(_keysDown[40])
	{
		if(_spaceRotPerSecond.x + addedRotPerSecond <= maxRotPerSecond)
		{
			_spaceRotPerSecond.x += addedRotPerSecond;
		}
	}
	
	if(_keysDown[38])
	{
		if(_spaceRotPerSecond.x - addedRotPerSecond >= -maxRotPerSecond)
			_spaceRotPerSecond.x -= addedRotPerSecond;
	}
}

function generateSpace(limitX, limitY, limitZ)
{
	var limX = Math.ceil(limitX / 2);
	var limY = Math.ceil(limitY / 2);
	var limZ = Math.ceil(limitZ / 2);
	
	_space = [];
	var spaces = [];
	for(var x = 0; x < limitX; ++x)
	{
		var spaceY = [];
		for(var y = 0; y < limitY; ++y)
		{
			var spaceZ = []
			for(var z = 0; z < limitZ; ++z)
			{
				if(Math.random() > (100 - _spaceFillPercent) / 100)
				{
					spaceZ.push(OBSTACLE);
				}
				else
				{
					spaceZ.push(SPACE);
					spaces.push({ x:x, y:y, z:z });
				}
			}
			spaceY.push(spaceZ);
		}
		_space.push(spaceY);
	}
	
	pathfinding.fnSetGraph(_space);
	
	_pStart = null;
	_pGoal = null;
	if(spaces.length >= 2)
	{
		generateStartPoint(spaces);
		generateGoalPoint(spaces);
	}
	else
	{
		alert("Not enough empty spaces for start and goal point. Try increasing dimensions or decrease fill percent");
	}
}

function generateStartPoint(spaces)
{
	var p = pickEmptySpacePoint(spaces);
	_pStart = p;
	pathfinding.fnSetStartPosition(p);
	_space[p.x][p.y][p.z] = START;
}

function generateGoalPoint(spaces)
{
	var p = pickEmptySpacePoint(spaces);
	_pGoal = p;
	pathfinding.fnSetGoalPosition(p);
	_space[p.x][p.y][p.z] = GOAL;
}

function pickEmptySpacePoint(spaces)
{
	if(spaces.length == 0)
		console.error("No empty spaces to pick");
	var i = Math.floor(Math.random() * spaces.length);
	var space = spaces[i];
	spaces.splice(i, 1);
	return space;
}

var drawScene = function()
{
	_gl.viewport(0, 0, _gl.viewportWidth, _gl.viewportHeight);
	_gl.clear(_gl.COLOR_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT);
	
	mat4.perspective(_pMatrix, 45, _gl.viewportWidth / _gl.viewportHeight, 0.1, 1000.0);
	mat4.identity(_mvMatrix);
	mat4.translate(_mvMatrix, _mvMatrix, [-_cameraPos.x, -_cameraPos.y, -_cameraPos.z]);
	
	mvPushMatrix();
	mat4.rotateX(_mvMatrix, _mvMatrix, _spaceRot.x);
	mat4.rotateY(_mvMatrix, _mvMatrix, _spaceRot.y);
	mat4.rotateZ(_mvMatrix, _mvMatrix, _spaceRot.z);
	
	var offsetX = Math.ceil(_space.length /  2);
	
	for(var x = 0; x < _space.length; ++x)
	{
		var offsetY = Math.ceil(_space[x].length /  2);
		for(var y = 0; y < _space[x].length; ++y)
		{
			var offsetZ = Math.ceil(_space[x][y].length /  2);
			for(var z = 0; z < _space[x][y].length; ++z)
			{
				var type = _space[x][y][z];
				if(type == OBSTACLE)
				{
					drawCube({
						x:x - offsetX, 
						y:y - offsetY, 
						z:z - offsetZ
					}, _wireframeObstacles ? _wireframeObstacleCubeBuffers : _solidObstacleCubeBuffers);
				}
				else if(type == START)
				{
					drawCube({
						x:x - offsetX, 
						y:y - offsetY, 
						z:z - offsetZ
					}, _solidStartCubeBuffers);
				}
				else if(type == GOAL)
				{
					drawCube({
						x:x - offsetX, 
						y:y - offsetY, 
						z:z - offsetZ
					}, _solidGoalCubeBuffers);
				}
				else if(type == Pathfinding.CHECKED)
				{
					drawCube({
						x:x - offsetX, 
						y:y - offsetY, 
						z:z - offsetZ
					}, _wireframeSearchedCubeBuffers);
				}
				else if(type == PATH)
				{
					drawCube({
						x:x - offsetX, 
						y:y - offsetY, 
						z:z - offsetZ
					}, _solidPathCubeBuffers);
				}
			}
		}
	}
	mvPopMatrix();
}

var tick = function()
{
	requestAnimFrame(tick);
	animate();
	updateInput();
	
	if(pathfinding._status == Pathfinding.FOUND)
	{
		
	}
	else
	{
		var status = pathfinding.fnTick();
		if(status.status == Pathfinding.FOUND && status.path)
		{
			var path = status.path;
			for(var i = 0; i < path.length; ++i)
			{
				var p = path[i];
				_space[p.x][p.y][p.z] = PATH;
			}
		} 
	}
	
	drawScene();
}
