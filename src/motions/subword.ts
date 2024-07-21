import * as vscode from 'vscode';

export function moveSubWordLeft() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const document = editor.document;
    const selection = editor.selection;

    const position = selection.active;
    let lineNumber = position.line;
    const subWordRegex = /([a-z]+|[A-Z][a-z]*|[0-9]+)/g;
    let isInOriginalLine = true;
    let candidatePosition: number | undefined = undefined;

    while (lineNumber >= 0) {
        const line = document.lineAt(lineNumber).text;

        while (true) {
            const match = subWordRegex.exec(line);
            if (!match) { break; }

            if (isInOriginalLine && (match.index >= position.character)) {
                break;
            }
            candidatePosition = match.index;
        }
        if (candidatePosition !== undefined) {
            const newPosition = new vscode.Position(lineNumber, candidatePosition);
            editor.selection = new vscode.Selection(newPosition, newPosition);
            return;
        }
        isInOriginalLine = false;
        lineNumber--;
    }
}

export function moveSubWordRight() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const document = editor.document;
    const selection = editor.selection;

    const position = selection.active;
    let lineNumber = position.line;
    const subWordRegex = /([a-z]+|[A-Z][a-z]*|[0-9]+)/g;
    let isInOriginalLine = true;
    let candidatePosition: number | undefined = undefined;

    while (lineNumber < document.lineCount) {
        const line = document.lineAt(lineNumber).text;

        while (true) {
            const match = subWordRegex.exec(line);
            if (!match) { break; }

            if (isInOriginalLine && (match.index <= position.character)) {
                continue;
            }
            candidatePosition = match.index;
            break;
        }
        if (candidatePosition !== undefined) {
            const newPosition = new vscode.Position(lineNumber, candidatePosition);
            editor.selection = new vscode.Selection(newPosition, newPosition);
            return;
        }
        isInOriginalLine = false;
        lineNumber++;
    }
}