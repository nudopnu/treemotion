import * as vscode from 'vscode';
import Parser, { SyntaxNode, Query } from 'tree-sitter';

type MotionParams = {
	startNode: SyntaxNode,
	document: vscode.TextDocument,
	position: vscode.Position,
	offset: number;
};

let vimMode: 'insert' | 'command' = 'insert';
let parser: Parser;

const PATTERN = {
	Identifier: '(identifier) @identifier',
	Block: '(block) @block',
	Parameters: '(parameters) @parameters',
};

const COMMON_TREE_MOTIONS: { [key: string]: (params: MotionParams) => SyntaxNode } = {
	findNextIdentifier: ({ startNode, offset }) => seek('next', PATTERN.Identifier, startNode, offset),
	findPreviousIdentifier: ({ startNode, offset }) => seek('previous', PATTERN.Identifier, startNode, offset),
	findNextBlock: ({ startNode, offset }) => seek('next', PATTERN.Block, startNode, offset),
	findPreviousBlock: ({ startNode, offset }) => seek('previous', PATTERN.Block, startNode, offset),
	findNextParameters: ({ startNode, offset }) => seek('next', PATTERN.Parameters, startNode, offset),
	findPreviousParameters: ({ startNode, offset }) => seek('previous', PATTERN.Parameters, startNode, offset),
	moveToParent: ({ startNode }) => seekNextParent(startNode),
	// moveToNextSibling: ({ startNode, position }) => seekNextSibling(startNode, position),
};

async function initializeParser(context: vscode.ExtensionContext, language: string) {
	parser = new Parser();
	switch (language) {
		case 'python':
			const Python = require('tree-sitter-python');
			parser.setLanguage(Python);
			registerMotions(context, COMMON_TREE_MOTIONS);
			break;
		case 'javascript':
			const JavaScript = require('tree-sitter-javascript');
			parser.setLanguage(JavaScript);
			registerMotions(context, COMMON_TREE_MOTIONS);
			break;
		default:
			// parser = null;
			vscode.window.showErrorMessage(`Unsupported language: ${language}`);
			break;
	}
}

function registerMotions(context: vscode.ExtensionContext, motions: { [key: string]: (params: MotionParams) => SyntaxNode }) {
	for (const motion in motions) {
		const name = `treemotions.${motion}`;
		const action = () => submitTreeMotion(motions[motion]);
		const command = vscode.commands.registerCommand(name, action);
		context.subscriptions.push(command);
	}
}

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((document) => handleFileOpen(context, document))
	);
	await initializeParserForActiveEditor(context);
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

	vscode.window.onDidChangeTextEditorSelection(updateCursor, null, context.subscriptions);
}

async function handleFileOpen(context: vscode.ExtensionContext, document: vscode.TextDocument) {
	const language = document.languageId;
	await initializeParser(context, language);
	parseActiveEditorContent();
}

function toggleMode() {
	vimMode = vimMode === 'insert' ? 'command' : 'insert';
	vscode.commands.executeCommand('setContext', 'vimMode', vimMode);
	updateCursor();
	parseActiveEditorContent();
}

async function initializeParserForActiveEditor(context: vscode.ExtensionContext) {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const document = editor.document;
		const language = document.languageId;
		await initializeParser(context, language);
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

function submitTreeMotion(targetFunc: (params: MotionParams) => SyntaxNode) {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !parser) return;

	const document = editor.document;
	const text = document.getText();
	const tree = parser.parse(text);
	const position = editor.selection.active;
	const offset = document.offsetAt(position);

	const startNode = tree.rootNode.namedDescendantForPosition({ row: position.line, column: position.character });
	let targetNode = targetFunc({ startNode, position, offset, document });

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

function seek(direction: 'next' | 'previous', pattern: string, startNode: any, offset: number) {
	const query = new Query(parser.getLanguage(), pattern);
	const captures = [...query.captures(startNode.tree.rootNode)];

	let previousNode = startNode;
	for (const capture of captures) {
		const nextNode = capture.node;
		if (direction === 'next' && nextNode.startIndex > offset) {
			return nextNode;
		} else if (direction === 'previous' && nextNode.startIndex >= offset && previousNode.startIndex < offset) {
			return previousNode;
		}
		previousNode = nextNode;
	}

	return startNode;
}

function seekNextSibling(node: any, document: vscode.TextDocument, position: vscode.Position) {

	/* Jump to first non-whitespace */
	const line = document.lineAt(position.line);
	const firstNonWhitespaceCharacterIndex = line.firstNonWhitespaceCharacterIndex;
	const startPosition = new vscode.Position(position.line, firstNonWhitespaceCharacterIndex);
	const startNode = node.tree.rootNode.namedDescendantForPosition({ row: startPosition.line, column: startPosition.character });

	let targetNode = startNode;

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

function jumpToFirstNonWhitespaceCharacter() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const document = editor.document;
	const position = editor.selection.active;
	const line = document.lineAt(position.line);
	const firstNonWhitespaceCharacterIndex = line.firstNonWhitespaceCharacterIndex;

	if (position.character <= firstNonWhitespaceCharacterIndex) {
		const newPosition = new vscode.Position(position.line, firstNonWhitespaceCharacterIndex);
		editor.selection = new vscode.Selection(newPosition, newPosition);
		editor.revealRange(new vscode.Range(newPosition, newPosition));
	}
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