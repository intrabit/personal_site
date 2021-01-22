const serverUrl = "https://e5egqefg64.execute-api.eu-west-1.amazonaws.com/live/server-coordinator-lambda"

const networkInterface = {
	"ip": null,
	"mac": null,
	"knownIps": null,
	sendMessage: function(queryParams, callback) {
		var request = new XMLHttpRequest();
		request.onreadystatechange = function() {
			if(this.readyState == 4) {
				callback(this.response);
			}
		}
		request.responseType = 'json';
		request.open("GET", serverUrl + queryParams, true);
		request.send();
	},
	initialise(networkInfo) {
		this.ip = networkInfo.ipAddress,
		this.mac = networkInfo.macAddress,
		this.knownIps = networkInfo.knownIps
	},
	findIp: function(ip) {
		var i;
		for(i = 0; i < this.knownIps.length; ++i) {
			if(this.knownIps[i] === ip) {
				return true;
			}
		}
		return false;
	}
};

const credentials = {
	"username": null,
	"password": null,
	hasCredentials: function() {
		return this.username != null && this.password != null;
	}
};

var commandMode = "command";
var pop3Authenticate = false;
var lastCommand = null;
var remoteSession = false;

class FileNode {
	constructor(fileName, fileType, fileValue) {
		this.fileName = fileName;
		this.fileType = fileType;
		this.fileValue = fileValue;
		this.childNodes = []
	}
	addChild(newFileNode) {
		this.childNodes.push(newFileNode);
	}
	resolveAddressToNode(address) { // Gets the node of an address.
		var addressComponents = address.split('/').filter(x => x != "");
		if(addressComponents.length === 0 || (addressComponents.length === 1 
			&& addressComponents[0] === this.fileName)) {
			return {
				"Node": this,
				"Trace": this.fileName
			};
		}
		var nextComponent = addressComponents[0];
		var i;
		for(i = 0; i < this.childNodes.length; i++) {
			if(this.childNodes[i].getFileName() === nextComponent) {
				var nextAddress = addressComponents.slice(1).join('/');
				var foundNode = this.childNodes[i].resolveAddressToNode(nextAddress);
				if(this.fileType != "rootNode") {
					foundNode.Trace = this.fileName + "/" + foundNode.Trace;
				}
				return foundNode;
			}
		}
		return {
			"Node": null,
			"Trace": this.fileName
		};
	}
	getFileName() {
		return this.fileName;
	}
	getChildListing() {
		var nameList = [];
		var i;
		for(i = 0; i < this.childNodes.length; ++i) {
			var node = this.childNodes[i];
			if(node.fileType === "folder") {
				nameList.push(node.fileName + "/");
			}
			else {
				nameList.push(node.fileName);
			}
		}
		return nameList;
	}
}

const fileStructure = {
	currentUsername: null,
	currentDirectoryString: "~",
	directoryAnchorNode: null,
	setUpFileNodes: function(parentNode, parentData) {
		var keys = Object.keys(parentData);
		var i;
		for(i = 0; i < keys.length; i++) {
			var nodeName = keys[i];
			var nodeType = nodeName.includes("/") ? "folder" : "file";
			if(nodeType == "folder") {
				continue;
			}
			var nodeValue = nodeType === "file" ? parentData[keys[i]] : null;
			var newNode = new FileNode(nodeName, nodeType, nodeValue);
			parentNode.addChild(newNode);
		}
	},
	parseRootLevelNodeData: function(dataNode, nodeName) {
		var keys = Object.keys(dataNode);
		var dataNodeFileType = nodeName.includes("/") ? "folder" : "file";
		var dataNodeValue = dataNodeFileType === "file" ? dataNode : null;
		if(dataNodeFileType === "folder") {
			nodeName = nodeName.replace('/', '');
		}
		var currentDataFileNode = new FileNode(nodeName, dataNodeFileType, dataNodeValue);
		this.setUpFileNodes(currentDataFileNode, dataNode);
		var i;
		for(i = 0; i < keys.length; i++) {
			if(keys[i].includes("/")) {
				var childFolderNode = this.parseRootLevelNodeData(dataNode[keys[i]], keys[i]);
				currentDataFileNode.addChild(childFolderNode);
			}
		}
		return currentDataFileNode;
	},
	initialise: function(driveData, username) {
		var anchorNode = new FileNode("anchor", "rootNode");
		var rootDirectoryNode = new FileNode("~", "folder");
		var rootChildrenKeys = Object.keys(driveData);
		var i;
		for(i = 0; i < rootChildrenKeys.length; i++) {
			var rootLevelNode = this.parseRootLevelNodeData(driveData[rootChildrenKeys[i]], rootChildrenKeys[i]);
			rootDirectoryNode.addChild(rootLevelNode);
		}
		anchorNode.addChild(rootDirectoryNode);
		this.directoryAnchorNode = anchorNode;
		this.currentUsername = username;
		var pTag = document.getElementById("currentDirectory");
		pTag.innerText = this.currentUsername + ":" + fileStructure.currentDirectoryString + "$> ";
	},
	resolvePathSpecialChars: function(path) {
		var fullPath = (fileStructure.currentDirectoryString + "/" + path).replace("//", "/");
		var pathComponents = fullPath.split('/').filter(x => x != "");
		var indexToRemove = -1;
		while((indexToRemove = pathComponents.indexOf("..")) != -1) {
			if(indexToRemove <= 1) {
				return null;
			}
			pathComponents.splice(indexToRemove-1, 2);
		}
		return pathComponents.join('/');
	},
	changeDirectory: function(newDirectory) {
		if(newDirectory === "") {
			return "No directory was passed.";
		}
		var finalPath = this.resolvePathSpecialChars(newDirectory);
		var node = this.directoryAnchorNode.resolveAddressToNode(finalPath);
		if(node.Node === null) {
			return `The directory ${newDirectory} could not be found`;
		}
		if(node.Node.fileType === "file") {
			return "The specified file isn't a subdirectory.";
		}
		this.currentDirectoryString = node.Trace;
		var pTag = document.getElementById("currentDirectory");
		pTag.innerText = this.currentUsername + ":" + fileStructure.currentDirectoryString + "$> ";
		return null;
	},
	getFiles: function() {
		var requiredNode = this.directoryAnchorNode.resolveAddressToNode(this.currentDirectoryString);
		return requiredNode.Node.getChildListing();
	},
	readFile: function(fileName) { 
		var fullPath = (this.currentDirectoryString + "/" + fileName);
		fullPath.replace("//", "/");
		var requiredNode = this.directoryAnchorNode.resolveAddressToNode(fullPath);
		if(requiredNode.Node === null) {
			return null;
		}
		return requiredNode.Node.fileValue;
	}
}

const terminal = {
	termWindow: document.getElementById("terminal"),
	termInput: document.getElementById("consoleInput"),
	lineQueue: null,
	maxLines: 33,
	initialise: function() {
		this.termWindow = document.getElementById("terminal");
		this.termInput = document.getElementById("consoleInput");
		this.lineQueue = new Queue();
		this.setReadCallback(ProcessInput);
	},
	trimLines: function() {
		while(this.lineQueue.getLength() >= this.maxLines) {
			var line = this.lineQueue.dequeue();
			line.remove();
		}
	},
	writeLine: function(text) {
		var currentNode = document.createElement("p");
		currentNode.innerText = text;
		this.termWindow.appendChild(currentNode);
		this.lineQueue.enqueue(currentNode);
		this.trimLines();
	},
	newLine: function() {
		var newLineNode = document.createElement("br");
		this.termWindow.appendChild(newLineNode);
		this.lineQueue.enqueue(newLineNode);
		this.trimLines();
	},
	setReadCallback: function(callback) {
		this.termInput.onkeydown = function(keyEvent) {
			if(keyEvent != null && keyEvent.key === "Enter") {
				var inputText = terminal.termInput.value;
				terminal.termInput.value = "";
				callback(inputText);
			}
		}
	}
};

const commandMaps = {
	maps: {
		"help": Help,
		"cd": Cd,
		"ls": Ls,
		"cat": Cat,
		"nscan": Nscan,
		"netset": Netset,
		"connect": NetConnect,
		"disconnect": Disconnect,
	},
	availableCommands: null,
	initialise: function(commands) {
		this.availableCommands = commands;
	},
	resolveCommand: function(name) {
		if(Object.keys(this.maps).includes(name)) {
			if(this.availableCommands.includes(name)) {
				return this.maps[name];
			}
			SystemSay("You don't have the correct privileges to use that command.");
			return null;
		}
		SystemSay("That command doesn't exist.");
		return null;
	}
};

function SystemSay(message)
{
	if(message.trim() == "") {
		terminal.newLine();
	}
	
	terminal.writeLine(message);
}

function PadLeft(toPadNumber, padDigits)
{
	var result = toPadNumber.toString();
	while(result.length < padDigits) {
		result = '0' + result;
	}
	return result;
}

function GetDateTimeString()
{
	var today = new Date();
	var dateString = PadLeft(today.getDate(), 2) + "/" + PadLeft(today.getMonth() + 1, 2) + "/" + today.getFullYear();
	var timeString = PadLeft(today.getHours(), 2) + ":" + PadLeft(today.getMinutes(), 2);
	return dateString + ", " + timeString;
}

function AlwaysFocusInput()
{
	var consoleInput = document.getElementById("consoleInput");
	var crtEffect = document.getElementById("crtEffect");
	consoleInput.focus();
	crtEffect.onclick = function() {
		consoleInput.focus();
	}
	document.body.onclick = function() {
		consoleInput.focus();
	}
}

function InitialiseMachine(machineFile) {
	fileStructure.initialise(machineFile.driveData, machineFile.username);
	networkInterface.initialise(machineFile.networkData);
	commandMaps.initialise(machineFile.availableCommands);
	for(let i = 0; i < machineFile.startMessage.length; ++i) {
		SystemSay(machineFile.startMessage[i]);
	}
	terminal.newLine();
}

window.onload = function() {
	AlwaysFocusInput();
	terminal.initialise();
	InitialiseMachine(mainComputer);
	SystemSay("Terminal interface initialised.");
	SystemSay("Loaded main drive data.");
	SystemSay("Network connected.");
	SystemSay("System ready.");
	SystemSay("Polyvia OS V2.1.0.0 " + GetDateTimeString());
	terminal.newLine();
};

// Command implementations.

function ProcessInput(inputText) {
	var commandString = `${fileStructure.currentUsername}:${fileStructure.currentDirectoryString}$> ${inputText}`;
	SystemSay(commandString);
	terminal.newLine();
	if(inputText === null || inputText.trim() === "") {
		return;
	}
	if(commandMode == "command") {
		var splitInput = inputText.split(' ');
		var inputCommand = splitInput[0].trim();
		var resolvedCommand = commandMaps.resolveCommand(inputCommand);
		if(resolvedCommand != null) {
			var commandArgs = [];
			if(splitInput.length > 1) {
				commandArgs = splitInput.slice(1);
			}
			resolvedCommand(commandArgs);
		}
		else {
			SystemSay("Type 'help' for help.");
		}
		terminal.newLine();
	}
	else if(commandMode == "pop3") {
		var splitInput = inputText.split(' ').filter(x => x != "");
		Pop3ServerCommandHandler(splitInput);
	}
}

// Help
var commandHelpMap = {
	"cat": HelpCat,
	"nscan": HelpNscan,
	"netset": HelpNetset,
	"connect": HelpConnect,
	"cd": HelpCd,
	"ls": HelpLs,
	"disconnect": HelpDisconnect
};

function Help(commandArgs) {
    if(commandArgs.length === 0) {
		SystemSay("Here is a list of available commands:");
		SystemSay("* help");
		SystemSay("* cat");
		SystemSay("* nscan");
		SystemSay("* netset");
		SystemSay("* connect");
		SystemSay("* cd");
		SystemSay("* ls");
		SystemSay("* disconnect");
		terminal.newLine();
		SystemSay("To get information on any of these commands, use help [command]");
		return;
    }
    if(commandArgs.length > 1){
		SystemSay("Usage: help [command]. For example 'help nscan'.");
		return;
	}
	if(commandArgs[0] in commandHelpMap) {
		commandHelpMap[commandArgs[0]]();
	}
	else {
		SystemSay(`Unable to find command '${commandArgs[0]}'.`);
		SystemSay("Usage: help [command]. For example 'help nscan'.");
	}
}

function HelpCat() {
    SystemSay("'cat' allows you to read text files.");
    SystemSay("Usage: cat [file]. For example 'cat file.txt'.");
}

function HelpNscan() {
    SystemSay("'nscan' allows you to scan the current network for other devices as well as showing you open ports.");
	SystemSay("To scan the network for devices: nscan -r [cidr]. For example 'nscan -r 10.10.10.0/24'");
	SystemSay("To scan a host for open ports: nscan -h [ip address]. For example 'nscan -h 10.10.10.2'");
}

function HelpNetset() {
	SystemSay("'netset' shows you all the settings of your network interface including IP address and MAC address.");
	SystemSay("Usage: netset. This command has no arguments.");
}

function HelpConnect() {
	SystemSay("'connect' opens a two-way terminal interface on a specified port.");
	SystemSay("Note: you can only connect to open ports running a telnet or SSH client. (e.g POP3, OpenSSH)");
	SystemSay("Note: you can provide credentials if required. Credentials are optional.")
	SystemSay("Usage: connect -h [ip address] -p [port] -u [username] -pw [password].");
	SystemSay("For example 'connect -h 10.10.10.2 -p 22 -u root -pw password");
}

function HelpDisconnect() {
	SystemSay("'disconnect' terminates the current remote session.");
	SystemSay("Usage: disconnect. This command has no arguments.");
}

function HelpCd() {
	SystemSay("'cd' changes the current directory to the one you specify.");
	SystemSay("Note: ~ is the home directory. Use cd ~/ to get to the home directory.");
	SystemSay("Note: .. goes back a directory. Use cd ../ to go back a directory.");
	SystemSay("Usage: cd [directory]. For example cd /subdirectory/");
}

function HelpLs() {
	SystemSay("'ls' displays all the files and folders within the current directory.");
	SystemSay("Usage: ls. This command has no arguments.");
}

// Cd

function Cd(commandArgs) {
	if(commandArgs.length === 0) {
		SystemSay("No arguments provided. Type 'help cd' for usage information.");
		return;
	}
	if(commandArgs.length > 1) {
		SystemSay("Too many arguments provided. Type 'help cd' for usage information.");
		return;
	}
	var result = fileStructure.changeDirectory(commandArgs[0]);
	if(result != null) {
		SystemSay("Error: " + result);
	}
}

// Ls

function Ls(commandArgs) {
	if(commandArgs.length > 0) {
		SystemSay("This command has no arguments. Type 'help ls' for usage information.");
		return;
	}
	var result = fileStructure.getFiles();
	var i;
	for(i = 0; i < result.length; i++) {
		SystemSay(result[i]);
	}
}

// Cat

function Cat(commandArgs) {
	if(commandArgs.length === 0) {
		SystemSay("No arguments provided. Type 'help cat' for usage information.");
		return;
	}
	if(commandArgs.length > 1) {
		SystemSay("Too many arguments provided. Type 'help cat' for usage information.");
	}
	var result = fileStructure.readFile(commandArgs[0]);
	if(result === null) {
		SystemSay(`Unable to find file ${commandArgs[0]} in current directory.`);
	}
	else {
		var i;
		for(i = 0; i < result.length; i++) {
			SystemSay(result[i]);
		}
	}
}

// Netset

function Netset() {
	SystemSay("Network adapter (1)");
	SystemSay("MAC address: " + networkInterface["mac"]);
	SystemSay("Assigned IP: " + networkInterface["ip"]);
	SystemSay("Network netmask: 255.255.255.0");
	terminal.newLine();
	SystemSay("No other adapters found.");
}

function CreateVariableByteBitmask(bits) {
	var mask = 0;
	var i;
	for(i = 0; i < bits; ++i) {
		mask++;
		mask = (mask << 1);
	}
	mask = (mask << 8 - bits - 1);
	return mask;
}

function CreateNetmask(bitRange) {
	var totalFullBytes = Math.floor(bitRange / 8); 
	var remainingBits = bitRange % 8; 
	var bitmask = [];
	var i;
	var remainingIndex = totalFullBytes; 
	bitmask[remainingIndex] = CreateVariableByteBitmask(remainingBits);
	for(i = 0; i < 4; ++i) {
		if(i < totalFullBytes) {
			bitmask[i] = 255;
			continue;
		}
		if(i != remainingIndex) {
			bitmask[i] = 0;
		}
	}
	return bitmask;
}

function ValidateIpAddress(ipAddress) {
	var components = ipAddress.split('.');
	if(components.length != 4) {
		return false;
	}
	var i;
	for(i = 0; i < components[i]; ++i) {
		if(isNaN(components[i])) {
			return false;
		}
		componentValue = parseInt(components[i]);
		if(componentValue > 255 || componentValue < 0) {
			return false;
		}
	}
	return true;
}

function ApplyNetmask(netmask) {
	var ipRange = [];
	var i;
	for(i = 0; i < 4; ++i) {
		var newValue = parseInt(255 - netmask[i]);
		ipRange[i] = newValue;
	}
	return ipRange;
}

function IterateComponentRange(ipComponents, rangeData) {
	if(rangeData == null) {
		return {"success": false};
	}
	var i;
	var iterationComponents = [...ipComponents];
	for(i = rangeData["minValue"]; i < rangeData["maxValue"]; ++i) {
		iterationComponents[rangeData["iterationIndex"]] = i;
		var ipString = iterationComponents.join(".");
		SystemSay("Checking IP: " + ipString);
		if(networkInterface.findIp(ipString)) {
			return {"success": true, "ip": ipString};
		}
		result = IterateComponentRange(iterationComponents, rangeData["next"]);
		if(result["success"]) {
			return result;
		}
	}
	return {"success": false};
}

// This section is like a kind of anonymous javascript ordered linked list which is pretty cool.

function SearchIpRange(ipAddress, bitRange) {
	var netmask = CreateNetmask(bitRange);
	var ipComponents = ipAddress.split('.');
	var ipRanges = ApplyNetmask(netmask);
	var rangeDataNodes = [];
	var i;
	for(i = 0; i < ipRanges.length; ++i) {
		if(ipRanges[i] > 0) {
			rangeDataNodes.push({
				"maxValue": ipRanges[i],
				"minValue": 0,
				"iterationIndex": i
			});
		}
	}
	for(i = 0; i < ipRanges.length - 1; ++i) {
		if(rangeDataNodes[i] != null && rangeDataNodes[i + 1] != null) {
			rangeDataNodes[i]["next"] = rangeDataNodes[i + 1];
		}
	}
	result = IterateComponentRange(ipComponents, rangeDataNodes[0]);
	if(result["success"]) {
		SystemSay("Found valid host at IP address: " + result["ip"]);
	}
	else {
		SystemSay("No hosts found on IP range.");
	}
	SystemSay("Scan complete.");
	SystemSay("Netmask used: " + netmask.join("."));
}

function HandlePortScanResults(data) {
	if(data == null) {
		SystemSay("The server didn't respond. Try again.");
		return;
	}
	if(data["success"]) {
		SystemSay("Port scan complete.");
		var message = data["message"];
		var keys = Object.keys(message);
		var i;
		terminal.newLine();
		for(i = 0; i < keys.length; ++i) {
			var portData = message[keys[i]];
			SystemSay(`Port ${keys[i]}: ${portData["status"]} (${portData["service"]})`);
		}
	} else {
		SystemSay("The server didn't respond.");
	}
}

function Nscan(commandArgs) {
	if(commandArgs.length != 2) {
		SystemSay("Wrong number of arguments provided. Type 'help nscan' for usage information.");
		return;
	}
	if(commandArgs[0] == "-r") {
		var cidrSegments = commandArgs[1].split('/').filter(x => x != "")
		if(cidrSegments.length != 2) {
			SystemSay("The provided CIDR block isn't valid. It should follow the format '10.10.10.0/24'");
			return;
		}
		if(isNaN(cidrSegments[1])) {
			SystemSay("The provided CIDR block isn't valid. It should follow the format '10.10.10.0/24'");
			return;
		}
		cidrRange = parseInt(cidrSegments[1]);
		if(cidrRange > 32) {
			SystemSay("The provided CIDR range cannot be above 32 bits, the maximum ipv4 address size.");
			return;
		}
		if(!ValidateIpAddress(cidrSegments[0])) {
			SystemSay("The provided IP address is not valid. Ip addresses cannot contain letters or values above 255.");
			return;
		}
		SearchIpRange(cidrSegments[0], cidrRange);
	}
	else if(commandArgs[0] === "-h") {
		if(!ValidateIpAddress(commandArgs[1])) {
			SystemSay("The provided IP address is not valid. Ip addresses cannot contain letters or values above 255.");
			return;
		}
		if(!networkInterface.findIp(commandArgs[1])) {
			SystemSay("Unable to find host.");
			return;
		}
		SystemSay(`Starting scan of host '${commandArgs[1]}'`);
		networkInterface.sendMessage("?mode=scan", HandlePortScanResults);
	}
}

function Pop3ServerResponseHandler(response) {
	if(!response["success"]) {
		SystemSay("- ERR " + response["message"]);
		return;
	} 
	if(pop3Authenticate) {
		SystemSay("+ OK User successfully logged on.");
		pop3Authenticate = false;
		return;
	}
	var message = response["message"];
	if(lastCommand === "list") {
		var i;
		for(i = 0; i < message.length; ++i) {
			var email = message[i];
			SystemSay(`${email["Index"]}  -  ${email["Size"]}`);
		}
	}
	if(lastCommand === "retr") {
		SystemSay(`+ OK ${message["Size"]} bytes`);
		SystemSay(`Subject: ${message["Subject"]}`);
		SystemSay("Body: ");
		for(let i = 0; i < message["Body"].length; ++i) {
			SystemSay(message["Body"][i]);
		}
	}
}

function Pop3ServerCommandHandler(commandArgs) {
	var command = commandArgs[0];
	if(command.toLowerCase() === "quit") {
		commandMode = "command";
		SystemSay("Disconnected from the server.");
		credentials.username = null;
		credentials.password = null;
		return;
	}
	if(command.toLowerCase() === "user") {
		if(commandArgs.length != 2) {
			SystemSay("- ERR Bad Number of Args");
			return;
		}
		credentials.username = commandArgs[1];
		SystemSay("+ OK");
	}
	else if(command.toLowerCase() === "pass") {
		if(commandArgs.length != 2) {
			SystemSay("- ERR Bad Number of Args");
			return;
		}
		if(credentials.username === null) {
			SystemSay("- ERR Provide Username First");
			return;
		}
		credentials.password = commandArgs[1];
		SystemSay("+ OK");
		pop3Authenticate = true; 
		networkInterface.sendMessage(`?mode=pop3command&username=${credentials.username}&password=${credentials.password}&command=list`, Pop3ServerResponseHandler);
	}
	else if(command.toLowerCase() === "list") {
		if(commandArgs.length != 1) {
			SystemSay("- ERR Bad Number of Args");
			return;
		}
 		if(!credentials.hasCredentials()) {
			SystemSay("- ERR Not Logged On Yet");
			return;
		}
		SystemSay("+ OK");
		lastCommand = "list";
		networkInterface.sendMessage(`?mode=pop3command&username=${credentials.username}&password=${credentials.password}&command=list`, Pop3ServerResponseHandler);
	}
	else if(command.toLowerCase() === "retr") {
		if(commandArgs.length != 2) {
			SystemSay("- ERR Bad Number of Args");
			return;
		}
		if(!credentials.hasCredentials()) {
			SystemSay("- ERR Not Logged On Yet");
			return;
		}
		SystemSay("+ OK");
		lastCommand = "retr";
		networkInterface.sendMessage(`?mode=pop3command&username=${credentials.username}&password=${credentials.password}&command=retr&data=${commandArgs[1]}`, Pop3ServerResponseHandler);
	}
	else {
		SystemSay("- ERR Unrecognised Command");
	}
}

function Disconnect() {
	if(!remoteSession) {
		SystemSay("There is no remote session in progress.");
		return;
	}
	SystemSay("Remote session terminated.");
	InitialiseMachine(mainComputer);
	terminal.newLine();
	remoteSession = false;
}

function SshCommandNetworkCallback(response) {
	if(!response["success"]) {
		SystemSay("Unable to establish connection.");
		return;
	}
	remoteSession = true;
	SystemSay("Connection established. Shell open.");
	SystemSay("Type 'disconnect' to end session.");
	terminal.newLine();
	InitialiseMachine(response["message"]);
}

function NetConnect(commandArgs) {
	if(commandArgs.length != 8 && commandArgs.length != 4) {
		SystemSay("Invalid number of commands. Type 'help connect' for usage information.");
		return;
	}
	if(!commandArgs.includes("-h") || !commandArgs.includes("-p")) {
		SystemSay("No host or ports specified.");
		return;
	}
	var hostIndex = commandArgs.indexOf("-h");
	var portIndex = commandArgs.indexOf("-p");
	var host = commandArgs[hostIndex + 1];
	var port = commandArgs[portIndex + 1];
	if(!ValidateIpAddress(host)) {
		SystemSay("The host IP address is invalid.");
		return;
	}
	if(isNaN(port)) {
		SystemSay("The port provided isn't a number.");
		return;
	}
	if(parseInt(port) <= 0) {
		SystemSay("Ports cannot be negative.");
		return;
	}
	if(!networkInterface.findIp(host)) {
		SystemSay("No host exists with that IP address.");
		return;
	}
	if(port === "110") {
		SystemSay("Attempting to connect to server.");
		if("-u" in commandArgs) {
			SystemSay("Not using provided credentials as connection doesn't require authentication.");
		}
		SystemSay("+OK L Corp Mail Server Ready. Please log-in.");
		commandMode = "pop3";
	}
	else if(port === "22") {
		if(!commandArgs.includes("-u") || !commandArgs.includes("-pw")) {
			SystemSay("SSH connection requires authorisation.");
			return;
		}
		var username = commandArgs[commandArgs.indexOf("-u") + 1];
		var password = commandArgs[commandArgs.indexOf("-pw") + 1];
		networkInterface.sendMessage(`?mode=sshcommand&username=${username}&password=${password}&command=x`, SshCommandNetworkCallback);
	}
	else {
		SystemSay("That port is closed.");
	}
}