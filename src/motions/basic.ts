import * as vscode from 'vscode';

export function navigate(direction: 'left' | 'down' | 'up' | 'right') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

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