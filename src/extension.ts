import * as vscode from 'vscode';
const Parser = require('tree-sitter');

let vimMode: 'insert' | 'command' = 'insert';
let parser: any;

async function initializeParser(language: string) {
	parser = new Parser();
	switch (language) {
		case 'python':
			const Python = require('tree-sitter-python');
			parser.setLanguage(Python);
			break;
		case 'javascript':
			const JavaScript = require('tree-sitter-javascript');
			parser.setLanguage(JavaScript);
			break;
		default:
			// parser = null;
			vscode.window.showErrorMessage(`Unsupported language: ${language}`);
			break;
	}
}

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(handleFileOpen)
	);
	await initializeParserForActiveEditor();
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.toggleMode', toggleMode)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.navigateLeft', () => navigate('left'))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.navigateDown', () => navigate('down'))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.navigateUp', () => navigate('up'))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.navigateRight', () => navigate('right'))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.goToDefinition', goToDefinition)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.findNextIdentifier', () => moveCursorWithinTree('nextIdentifier'))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.findPreviousIdentifier', () => moveCursorWithinTree('previousIdentifier'))
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.moveToNextSibling', moveToNextSibling)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.moveToPreviousSibling', moveToPreviousSibling)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.moveToParent', () => moveCursorWithinTree('parent'))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('treemotions.moveToChild', () => moveCursorWithinTree('firstNamedChild'))
	);

	vscode.window.onDidChangeTextEditorSelection(updateCursor, null, context.subscriptions);
}

async function handleFileOpen(document: vscode.TextDocument) {
	const language = document.languageId;
	await initializeParser(language);
	parseActiveEditorContent();
}

function toggleMode() {
	vimMode = vimMode === 'insert' ? 'command' : 'insert';
	vscode.commands.executeCommand('setContext', 'vimMode', vimMode);
	updateCursor();
	parseActiveEditorContent();
}

async function initializeParserForActiveEditor() {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const document = editor.document;
		const language = document.languageId;
		await initializeParser(language);
	}
}

async function parseActiveEditorContent() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const document = editor.document;
	const text = document.getText();
	const tree = parser.parse(text);

	// Now you can work with the parsed tree
	console.log(tree.rootNode.toString());
}

function navigate(direction: 'left' | 'down' | 'up' | 'right') {
	const editor = vscode.window.activeTextEditor;
	if (!editor || vimMode !== 'command') return;

	const positions = editor.selections.map(selection => {
		const position = selection.active;
		switch (direction) {
			case 'left': return position.translate(0, -1);
			case 'down': return position.translate(1, 0);
			case 'up': return position.translate(-1, 0);
			case 'right': return position.translate(0, 1);
		}
	});

	editor.selections = positions.map(position => new vscode.Selection(position, position));
}

function moveToPreviousIdentifier() {
	moveCursorWithinTree('previousIdentifier');
}

function moveToNextSibling() {
	moveCursorWithinTree('nextSibling');
}

function moveToPreviousSibling() {
	moveCursorWithinTree('previousSibling');
}

function moveCursorWithinTree(moveType: 'nextSibling' | 'previousSibling' | 'parent' | 'firstNamedChild' | 'nextIdentifier' | 'previousIdentifier') {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !parser) return;

	const document = editor.document;
	const text = document.getText();
	const tree = parser.parse(text);
	const position = editor.selection.active;

	const node = tree.rootNode.namedDescendantForPosition({ row: position.line, column: position.character });
	let targetNode = node[moveType];
	if (moveType === 'parent') {
		targetNode = seekNextParent(node);
	} else if (moveType === 'nextSibling') {
		targetNode = seekNextSibling(node);
	} else if (moveType === 'nextIdentifier') {
		targetNode = seekNextIdentifier(node);
	} else if (moveType === 'previousIdentifier') {
		targetNode = seekPreviousIdentifier(node);
	}

	vscode.window.showInformationMessage(`[${moveType}] Current node: \n${node}\nTarget node (): \n${targetNode}`);

	if (targetNode) {
		const newPosition = new vscode.Position(targetNode.startPosition.row, targetNode.startPosition.column);
		editor.selection = new vscode.Selection(newPosition, newPosition);
		editor.revealRange(new vscode.Range(newPosition, newPosition));
	}
}

function seekNextParent(node: any) {
	const startIndex = node.startIndex;
	let targetNode = node;
	while (targetNode.startIndex === startIndex && targetNode.startIndex !== 0) {
		targetNode = targetNode.parent;
	}
	return targetNode;
}

function seekNextIdentifier(node: any) {
	// Create a query to find all identifier nodes
	const query = new Parser.Query(parser.getLanguage(), '(identifier) @identifier');
	const captures = query.captures(node.tree.rootNode);

	// Find the next identifier after the current cursor position
	for (let capture of captures) {
		const identifierNode = capture.node;
		if (identifierNode.startIndex > node.startIndex) {
			return identifierNode;
		}
	}
	return node;
}

function seekPreviousIdentifier(node: any) {
	// Create a query to find all identifier nodes
	const query = new Parser.Query(parser.getLanguage(), '(identifier) @identifier');
	const captures = [...query.captures(node.tree.rootNode)].reverse();

	// Find the next identifier after the current cursor position
	for (let capture of captures) {
		const identifierNode = capture.node;
		if (identifierNode.startIndex < node.startIndex) {
			return identifierNode;
		}
	}
	return node;
}

function seekNextSibling(node: any) {
	const startIndex = node.startIndex;
	let targetNode = node;
	while (targetNode.nextSibling === null) {
		targetNode = targetNode.parent;
		if (targetNode.startIndex === 0) {
			if (node.namedChildCount === 0) {
				return node;
			} else {
				targetNode = node.firstNamedChild;
			}
		}
	}
	return targetNode.nextSibling ?? targetNode;
}

async function goToDefinition() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;
	await vscode.commands.executeCommand('editor.action.goToDeclaration');
}

function updateCursor() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const cursorStyle = vimMode === 'command' ? vscode.TextEditorCursorStyle.Block : vscode.TextEditorCursorStyle.Line;
	editor.options.cursorStyle = cursorStyle;
}


export function deactivate() { }