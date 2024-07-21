import Parser, { SyntaxNode, Query, Tree } from 'tree-sitter';
import * as vscode from 'vscode';

export type MotionParams = {
    startNode: SyntaxNode,
    tree: Tree,
    document: vscode.TextDocument,
    position: vscode.Position,
    offset: number;
};

export type Mode = 'insert' | 'command';

export type State = {
    mode: Mode;
    languageId?: string;
    parser?: Parser;
    tree?: Parser.Tree;
};