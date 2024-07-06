import * as vscode from 'vscode';

let vimMode: 'insert' | 'command' = 'insert';

export function activate(context: vscode.ExtensionContext) {
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

	vscode.window.onDidChangeTextEditorSelection(updateCursor, null, context.subscriptions);

}

function toggleMode() {
	vimMode = vimMode === 'insert' ? 'command' : 'insert';
	vscode.commands.executeCommand('setContext', 'vimMode', vimMode);
	updateCursor();
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

function updateCursor() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const cursorStyle = vimMode === 'command' ? vscode.TextEditorCursorStyle.Block : vscode.TextEditorCursorStyle.Line;
	editor.options.cursorStyle = cursorStyle;
}


export function deactivate() { }
