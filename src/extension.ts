import * as vscode from 'vscode';
import Parser, { SyntaxNode, Query, Tree } from 'tree-sitter';

type MotionParams = {
	startNode: SyntaxNode,
	tree: Tree,
	document: vscode.TextDocument,
	position: vscode.Position,
	offset: number;
};

let vimMode: 'insert' | 'command' = 'insert';
let parser: Parser;

const PATTERN = {
	Identifier: '(identifier) @identifier',
	Block: '(block) @block',
	Parameters: '[(parameters) (argument_list)] @args',
};

const COMMON_TREE_MOTIONS: { [key: string]: (params: MotionParams) => SyntaxNode } = {
	findNextIdentifier: ({ startNode, offset }) => seek('next', PATTERN.Identifier, startNode, offset),
	findPreviousIdentifier: ({ startNode, offset }) => seek('previous', PATTERN.Identifier, startNode, offset),
	findNextBlock: ({ startNode, offset }) => seek('next', PATTERN.Block, startNode, offset),
	findPreviousBlock: ({ startNode, offset }) => seek('previous', PATTERN.Block, startNode, offset),
	findNextParameters: ({ startNode, offset }) => seek('next', PATTERN.Parameters, startNode, offset),
	findPreviousParameters: ({ startNode, offset }) => seek('previous', PATTERN.Parameters, startNode, offset),
	moveToParent: ({ startNode }) => seekNextParent(startNode),
	moveToNextSibling: ({ startNode, document, position, offset }) => seekNextSibling(startNode, document, offset, position),
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
	if (!editor) { return; }

	const document = editor.document;
	const text = document.getText();
	const tree = parser.parse(text);

	// Now you can work with the parsed tree
	console.log(tree.rootNode.toString());
}

function navigate(direction: 'left' | 'down' | 'up' | 'right') {
	const editor = vscode.window.activeTextEditor;
	if (!editor || vimMode !== 'command') { return; }

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
	if (!editor || !parser) { return; }

	const document = editor.document;
	const text = document.getText();
	const tree = parser.parse(text);
	const position = editor.selection.active;
	const offset = document.offsetAt(position);

	const startNode = tree.rootNode.namedDescendantForPosition({ row: position.line, column: position.character });
	let targetNode = targetFunc({ startNode, position, offset, document, tree });

	if (targetNode) {
		const newPosition = new vscode.Position(targetNode.startPosition.row, targetNode.startPosition.column);
		editor.selection = new vscode.Selection(newPosition, newPosition);
		editor.revealRange(new vscode.Range(newPosition, newPosition));
	}
}

function seekNextParent(node: SyntaxNode) {
	const startIndex = node.startIndex;
	let targetNode = node;
	/* Choose a parent that starts before current node (or root) */
	while (targetNode.startIndex === startIndex && targetNode.startIndex !== 0) {
		targetNode = targetNode.parent || targetNode.tree.rootNode;
	}
	return targetNode;
}

function seek(direction: 'next' | 'previous', pattern: string, startNode: SyntaxNode, offset: number) {
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

function seekNextSibling(node: SyntaxNode, document: vscode.TextDocument, offset: number, position: vscode.Position): SyntaxNode {
	/* Mark first non-whitespace line */
	let lineNumber = position.line;
	let line = document.lineAt(lineNumber);
	while (line.isEmptyOrWhitespace) {
		lineNumber += 1;
		if (lineNumber === document.lineCount) {
			return node;
		}
		line = document.lineAt(lineNumber);
	}

	/* Get node at first non-whitespace character */
	const firstNonWhitespaceCharacterIndex = line.firstNonWhitespaceCharacterIndex;
	const startNode = node.tree.rootNode.namedDescendantForPosition({
		row: lineNumber,
		column: firstNonWhitespaceCharacterIndex
	});

	/* Jump to first node if it wasn't already after or on that position */
	if (offset < startNode.startIndex) {
		return startNode;
	}

	/* Get largest single-line node (if it is smaller than whole line)*/
	let targetNode = startNode;
	let previousNode = targetNode;
	while (targetNode.startPosition.row === targetNode.endPosition.row) {
		if (!targetNode.parent) { break; };
		previousNode = targetNode;
		targetNode = targetNode.parent;
	}
	targetNode = previousNode;
	vscode.window.showInformationMessage(targetNode.text);

	/* If it was a multi-line node, get child that starts below current line */
	if (!targetNode.nextSibling && targetNode.startPosition.row !== targetNode.endPosition.row) {
		while (!targetNode.nextSibling) {
			if (!targetNode.children) {
				return targetNode;
			}
			for (const child of targetNode.children) {
				if (child.startPosition.row <= targetNode.startPosition.row) { continue; }
				return child;
			}
		}
	}

	/* If it has no sibling, go to parent */
	while (!targetNode.nextSibling) {
		if (!targetNode.parent) {
			return node;
		}
		targetNode = targetNode.parent;
	}

	return targetNode.nextSibling ?? node;
}


async function goToDefinition() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) { return; }
	await vscode.commands.executeCommand('editor.action.goToDeclaration');
}

function updateCursor() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) { return; }

	const cursorStyle = vimMode === 'command' ? vscode.TextEditorCursorStyle.Block : vscode.TextEditorCursorStyle.Line;
	editor.options.cursorStyle = cursorStyle;
}


export function deactivate() { }