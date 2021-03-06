/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const enum ScanError {
	None = 0,
	UnexpectedEndOfComment = 1,
	UnexpectedEndOfString = 2,
	UnexpectedEndOfNumber = 3,
	InvalidUnicode = 4,
	InvalidEscapeCharacter = 5,
	InvalidCharacter = 6
}

const enum SyntaxKind {
	OpenBraceToken = 1,
	CloseBraceToken = 2,
	OpenBracketToken = 3,
	CloseBracketToken = 4,
	CommaToken = 5,
	ColonToken = 6,
	NullKeyword = 7,
	TrueKeyword = 8,
	FalseKeyword = 9,
	StringLiteral = 10,
	NumericLiteral = 11,
	LineCommentTrivia = 12,
	BlockCommentTrivia = 13,
	LineBreakTrivia = 14,
	Trivia = 15,
	Unknown = 16,
	EOF = 17
}

/**
 * The scanner object, representing a JSON scanner at a position in the input string.
 */
interface JSONScanner {
	/**
	 * Sets the scan position to a new offset. A call to 'scan' is needed to get the first token.
	 */
	setPosition(pos: number): void;
	/**
	 * Read the next token. Returns the token code.
	 */
	scan(): SyntaxKind;
	/**
	 * Returns the current scan position, which is after the last read token.
	 */
	getPosition(): number;
	/**
	 * Returns the last read token.
	 */
	getToken(): SyntaxKind;
	/**
	 * Returns the last read token value. The value for strings is the decoded string content. For numbers its of type number, for boolean it's true or false.
	 */
	getTokenValue(): string;
	/**
	 * The start offset of the last read token.
	 */
	getTokenOffset(): number;
	/**
	 * The length of the last read token.
	 */
	getTokenLength(): number;
	/**
	 * An error code of the last scan.
	 */
	getTokenError(): ScanError;
}



export interface ParseError {
	error: ParseErrorCode;
	offset: number;
	length: number;
}

const enum ParseErrorCode {
	InvalidSymbol = 1,
	InvalidNumberFormat = 2,
	PropertyNameExpected = 3,
	ValueExpected = 4,
	ColonExpected = 5,
	CommaExpected = 6,
	CloseBraceExpected = 7,
	CloseBracketExpected = 8,
	EndOfFileExpected = 9,
	InvalidCommentToken = 10,
	UnexpectedEndOfComment = 11,
	UnexpectedEndOfString = 12,
	UnexpectedEndOfNumber = 13,
	InvalidUnicode = 14,
	InvalidEscapeCharacter = 15,
	InvalidCharacter = 16
}

type NodeType = 'object' | 'array' | 'property' | 'string' | 'number' | 'boolean' | 'null';

interface Node {
	readonly type: NodeType;
	readonly value?: any;
	readonly offset: number;
	readonly length: number;
	readonly colonOffset?: number;
	readonly parent?: Node;
	readonly children?: Node[];
}

interface ParseOptions {
	disallowComments?: boolean;
	allowTrailingComma?: boolean;
	allowEmptyContent?: boolean;
}

namespace ParseOptions {
	export const DEFAULT = {
		allowTrailingComma: true
	};
}

interface JSONVisitor {
	/**
	 * Invoked when an open brace is encountered and an object is started. The offset and length represent the location of the open brace.
	 */
	onObjectBegin?: (offset: number, length: number) => void;

	/**
	 * Invoked when a property is encountered. The offset and length represent the location of the property name.
	 */
	onObjectProperty?: (property: string, offset: number, length: number) => void;

	/**
	 * Invoked when a closing brace is encountered and an object is completed. The offset and length represent the location of the closing brace.
	 */
	onObjectEnd?: (offset: number, length: number) => void;

	/**
	 * Invoked when an open bracket is encountered. The offset and length represent the location of the open bracket.
	 */
	onArrayBegin?: (offset: number, length: number) => void;

	/**
	 * Invoked when a closing bracket is encountered. The offset and length represent the location of the closing bracket.
	 */
	onArrayEnd?: (offset: number, length: number) => void;

	/**
	 * Invoked when a literal value is encountered. The offset and length represent the location of the literal value.
	 */
	onLiteralValue?: (value: any, offset: number, length: number) => void;

	/**
	 * Invoked when a comma or colon separator is encountered. The offset and length represent the location of the separator.
	 */
	onSeparator?: (character: string, offset: number, length: number) => void;

	/**
	 * When comments are allowed, invoked when a line or block comment is encountered. The offset and length represent the location of the comment.
	 */
	onComment?: (offset: number, length: number) => void;

	/**
	 * Invoked on an error.
	 */
	onError?: (error: ParseErrorCode, offset: number, length: number) => void;
}

/**
 * Creates a JSON scanner on the given text.
 * If ignoreTrivia is set, whitespaces or comments are ignored.
 */
function createScanner(text: string, ignoreTrivia: boolean = false): JSONScanner {

	let pos = 0,
		len = text.length,
		value: string = '',
		tokenOffset = 0,
		token: SyntaxKind = SyntaxKind.Unknown,
		scanError: ScanError = ScanError.None;

	function scanHexDigits(count: number): number {
		let digits = 0;
		let hexValue = 0;
		while (digits < count) {
			const ch = text.charCodeAt(pos);
			if (ch >= CharacterCodes._0 && ch <= CharacterCodes._9) {
				hexValue = hexValue * 16 + ch - CharacterCodes._0;
			}
			else if (ch >= CharacterCodes.A && ch <= CharacterCodes.F) {
				hexValue = hexValue * 16 + ch - CharacterCodes.A + 10;
			}
			else if (ch >= CharacterCodes.a && ch <= CharacterCodes.f) {
				hexValue = hexValue * 16 + ch - CharacterCodes.a + 10;
			}
			else {
				break;
			}
			pos++;
			digits++;
		}
		if (digits < count) {
			hexValue = -1;
		}
		return hexValue;
	}

	function setPosition(newPosition: number) {
		pos = newPosition;
		value = '';
		tokenOffset = 0;
		token = SyntaxKind.Unknown;
		scanError = ScanError.None;
	}

	function scanNumber(): string {
		const start = pos;
		if (text.charCodeAt(pos) === CharacterCodes._0) {
			pos++;
		} else {
			pos++;
			while (pos < text.length && isDigit(text.charCodeAt(pos))) {
				pos++;
			}
		}
		if (pos < text.length && text.charCodeAt(pos) === CharacterCodes.dot) {
			pos++;
			if (pos < text.length && isDigit(text.charCodeAt(pos))) {
				pos++;
				while (pos < text.length && isDigit(text.charCodeAt(pos))) {
					pos++;
				}
			} else {
				scanError = ScanError.UnexpectedEndOfNumber;
				return text.substring(start, pos);
			}
		}
		let end = pos;
		if (pos < text.length && (text.charCodeAt(pos) === CharacterCodes.E || text.charCodeAt(pos) === CharacterCodes.e)) {
			pos++;
			if (pos < text.length && text.charCodeAt(pos) === CharacterCodes.plus || text.charCodeAt(pos) === CharacterCodes.minus) {
				pos++;
			}
			if (pos < text.length && isDigit(text.charCodeAt(pos))) {
				pos++;
				while (pos < text.length && isDigit(text.charCodeAt(pos))) {
					pos++;
				}
				end = pos;
			} else {
				scanError = ScanError.UnexpectedEndOfNumber;
			}
		}
		return text.substring(start, end);
	}

	function scanString(): string {

		let result = '',
			start = pos;

		while (true) {
			if (pos >= len) {
				result += text.substring(start, pos);
				scanError = ScanError.UnexpectedEndOfString;
				break;
			}
			const ch = text.charCodeAt(pos);
			if (ch === CharacterCodes.doubleQuote) {
				result += text.substring(start, pos);
				pos++;
				break;
			}
			if (ch === CharacterCodes.backslash) {
				result += text.substring(start, pos);
				pos++;
				if (pos >= len) {
					scanError = ScanError.UnexpectedEndOfString;
					break;
				}
				const ch2 = text.charCodeAt(pos++);
				switch (ch2) {
					case CharacterCodes.doubleQuote:
						result += '\"';
						break;
					case CharacterCodes.backslash:
						result += '\\';
						break;
					case CharacterCodes.slash:
						result += '/';
						break;
					case CharacterCodes.b:
						result += '\b';
						break;
					case CharacterCodes.f:
						result += '\f';
						break;
					case CharacterCodes.n:
						result += '\n';
						break;
					case CharacterCodes.r:
						result += '\r';
						break;
					case CharacterCodes.t:
						result += '\t';
						break;
					case CharacterCodes.u: {
						const ch3 = scanHexDigits(4);
						if (ch3 >= 0) {
							result += String.fromCharCode(ch3);
						} else {
							scanError = ScanError.InvalidUnicode;
						}
						break;
					}
					default:
						scanError = ScanError.InvalidEscapeCharacter;
				}
				start = pos;
				continue;
			}
			if (ch >= 0 && ch <= 0x1F) {
				if (isLineBreak(ch)) {
					result += text.substring(start, pos);
					scanError = ScanError.UnexpectedEndOfString;
					break;
				} else {
					scanError = ScanError.InvalidCharacter;
					// mark as error but continue with string
				}
			}
			pos++;
		}
		return result;
	}

	function scanNext(): SyntaxKind {

		value = '';
		scanError = ScanError.None;

		tokenOffset = pos;

		if (pos >= len) {
			// at the end
			tokenOffset = len;
			return token = SyntaxKind.EOF;
		}

		let code = text.charCodeAt(pos);
		// trivia: whitespace
		if (isWhitespace(code)) {
			do {
				pos++;
				value += String.fromCharCode(code);
				code = text.charCodeAt(pos);
			} while (isWhitespace(code));

			return token = SyntaxKind.Trivia;
		}

		// trivia: newlines
		if (isLineBreak(code)) {
			pos++;
			value += String.fromCharCode(code);
			if (code === CharacterCodes.carriageReturn && text.charCodeAt(pos) === CharacterCodes.lineFeed) {
				pos++;
				value += '\n';
			}
			return token = SyntaxKind.LineBreakTrivia;
		}

		switch (code) {
			// tokens: []{}:,
			case CharacterCodes.openBrace:
				pos++;
				return token = SyntaxKind.OpenBraceToken;
			case CharacterCodes.closeBrace:
				pos++;
				return token = SyntaxKind.CloseBraceToken;
			case CharacterCodes.openBracket:
				pos++;
				return token = SyntaxKind.OpenBracketToken;
			case CharacterCodes.closeBracket:
				pos++;
				return token = SyntaxKind.CloseBracketToken;
			case CharacterCodes.colon:
				pos++;
				return token = SyntaxKind.ColonToken;
			case CharacterCodes.comma:
				pos++;
				return token = SyntaxKind.CommaToken;

			// strings
			case CharacterCodes.doubleQuote:
				pos++;
				value = scanString();
				return token = SyntaxKind.StringLiteral;

			// comments
			case CharacterCodes.slash: {
				const start = pos - 1;
				// Single-line comment
				if (text.charCodeAt(pos + 1) === CharacterCodes.slash) {
					pos += 2;

					while (pos < len) {
						if (isLineBreak(text.charCodeAt(pos))) {
							break;
						}
						pos++;

					}
					value = text.substring(start, pos);
					return token = SyntaxKind.LineCommentTrivia;
				}

				// Multi-line comment
				if (text.charCodeAt(pos + 1) === CharacterCodes.asterisk) {
					pos += 2;

					const safeLength = len - 1; // For lookahead.
					let commentClosed = false;
					while (pos < safeLength) {
						const ch = text.charCodeAt(pos);

						if (ch === CharacterCodes.asterisk && text.charCodeAt(pos + 1) === CharacterCodes.slash) {
							pos += 2;
							commentClosed = true;
							break;
						}
						pos++;
					}

					if (!commentClosed) {
						pos++;
						scanError = ScanError.UnexpectedEndOfComment;
					}

					value = text.substring(start, pos);
					return token = SyntaxKind.BlockCommentTrivia;
				}
				// just a single slash
				value += String.fromCharCode(code);
				pos++;
				return token = SyntaxKind.Unknown;
			}
			// numbers
			case CharacterCodes.minus:
				value += String.fromCharCode(code);
				pos++;
				if (pos === len || !isDigit(text.charCodeAt(pos))) {
					return token = SyntaxKind.Unknown;
				}
			// found a minus, followed by a number so
			// we fall through to proceed with scanning
			// numbers
			case CharacterCodes._0:
			case CharacterCodes._1:
			case CharacterCodes._2:
			case CharacterCodes._3:
			case CharacterCodes._4:
			case CharacterCodes._5:
			case CharacterCodes._6:
			case CharacterCodes._7:
			case CharacterCodes._8:
			case CharacterCodes._9:
				value += scanNumber();
				return token = SyntaxKind.NumericLiteral;
			// literals and unknown symbols
			default:
				// is a literal? Read the full word.
				while (pos < len && isUnknownContentCharacter(code)) {
					pos++;
					code = text.charCodeAt(pos);
				}
				if (tokenOffset !== pos) {
					value = text.substring(tokenOffset, pos);
					// keywords: true, false, null
					switch (value) {
						case 'true': return token = SyntaxKind.TrueKeyword;
						case 'false': return token = SyntaxKind.FalseKeyword;
						case 'null': return token = SyntaxKind.NullKeyword;
					}
					return token = SyntaxKind.Unknown;
				}
				// some
				value += String.fromCharCode(code);
				pos++;
				return token = SyntaxKind.Unknown;
		}
	}

	function isUnknownContentCharacter(code: CharacterCodes) {
		if (isWhitespace(code) || isLineBreak(code)) {
			return false;
		}
		switch (code) {
			case CharacterCodes.closeBrace:
			case CharacterCodes.closeBracket:
			case CharacterCodes.openBrace:
			case CharacterCodes.openBracket:
			case CharacterCodes.doubleQuote:
			case CharacterCodes.colon:
			case CharacterCodes.comma:
			case CharacterCodes.slash:
				return false;
		}
		return true;
	}


	function scanNextNonTrivia(): SyntaxKind {
		let result: SyntaxKind;
		do {
			result = scanNext();
		} while (result >= SyntaxKind.LineCommentTrivia && result <= SyntaxKind.Trivia);
		return result;
	}

	return {
		setPosition: setPosition,
		getPosition: () => pos,
		scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
		getToken: () => token,
		getTokenValue: () => value,
		getTokenOffset: () => tokenOffset,
		getTokenLength: () => pos - tokenOffset,
		getTokenError: () => scanError
	};
}

function isWhitespace(ch: number): boolean {
	return ch === CharacterCodes.space || ch === CharacterCodes.tab || ch === CharacterCodes.verticalTab || ch === CharacterCodes.formFeed ||
		ch === CharacterCodes.nonBreakingSpace || ch === CharacterCodes.ogham || ch >= CharacterCodes.enQuad && ch <= CharacterCodes.zeroWidthSpace ||
		ch === CharacterCodes.narrowNoBreakSpace || ch === CharacterCodes.mathematicalSpace || ch === CharacterCodes.ideographicSpace || ch === CharacterCodes.byteOrderMark;
}

function isLineBreak(ch: number): boolean {
	return ch === CharacterCodes.lineFeed || ch === CharacterCodes.carriageReturn || ch === CharacterCodes.lineSeparator || ch === CharacterCodes.paragraphSeparator;
}

function isDigit(ch: number): boolean {
	return ch >= CharacterCodes._0 && ch <= CharacterCodes._9;
}

const enum CharacterCodes {
	nullCharacter = 0,
	maxAsciiCharacter = 0x7F,

	lineFeed = 0x0A,              // \n
	carriageReturn = 0x0D,        // \r
	lineSeparator = 0x2028,
	paragraphSeparator = 0x2029,

	// REVIEW: do we need to support this?  The scanner doesn't, but our IText does.  This seems
	// like an odd disparity?  (Or maybe it's completely fine for them to be different).
	nextLine = 0x0085,

	// Unicode 3.0 space characters
	space = 0x0020,   // " "
	nonBreakingSpace = 0x00A0,   //
	enQuad = 0x2000,
	emQuad = 0x2001,
	enSpace = 0x2002,
	emSpace = 0x2003,
	threePerEmSpace = 0x2004,
	fourPerEmSpace = 0x2005,
	sixPerEmSpace = 0x2006,
	figureSpace = 0x2007,
	punctuationSpace = 0x2008,
	thinSpace = 0x2009,
	hairSpace = 0x200A,
	zeroWidthSpace = 0x200B,
	narrowNoBreakSpace = 0x202F,
	ideographicSpace = 0x3000,
	mathematicalSpace = 0x205F,
	ogham = 0x1680,

	_ = 0x5F,
	$ = 0x24,

	_0 = 0x30,
	_1 = 0x31,
	_2 = 0x32,
	_3 = 0x33,
	_4 = 0x34,
	_5 = 0x35,
	_6 = 0x36,
	_7 = 0x37,
	_8 = 0x38,
	_9 = 0x39,

	a = 0x61,
	b = 0x62,
	c = 0x63,
	d = 0x64,
	e = 0x65,
	f = 0x66,
	g = 0x67,
	h = 0x68,
	i = 0x69,
	j = 0x6A,
	k = 0x6B,
	l = 0x6C,
	m = 0x6D,
	n = 0x6E,
	o = 0x6F,
	p = 0x70,
	q = 0x71,
	r = 0x72,
	s = 0x73,
	t = 0x74,
	u = 0x75,
	v = 0x76,
	w = 0x77,
	x = 0x78,
	y = 0x79,
	z = 0x7A,

	A = 0x41,
	B = 0x42,
	C = 0x43,
	D = 0x44,
	E = 0x45,
	F = 0x46,
	G = 0x47,
	H = 0x48,
	I = 0x49,
	J = 0x4A,
	K = 0x4B,
	L = 0x4C,
	M = 0x4D,
	N = 0x4E,
	O = 0x4F,
	P = 0x50,
	Q = 0x51,
	R = 0x52,
	S = 0x53,
	T = 0x54,
	U = 0x55,
	V = 0x56,
	W = 0x57,
	X = 0x58,
	Y = 0x59,
	Z = 0x5A,

	ampersand = 0x26,             // &
	asterisk = 0x2A,              // *
	at = 0x40,                    // @
	backslash = 0x5C,             // \
	bar = 0x7C,                   // |
	caret = 0x5E,                 // ^
	closeBrace = 0x7D,            // }
	closeBracket = 0x5D,          // ]
	closeParen = 0x29,            // )
	colon = 0x3A,                 // :
	comma = 0x2C,                 // ,
	dot = 0x2E,                   // .
	doubleQuote = 0x22,           // "
	equals = 0x3D,                // =
	exclamation = 0x21,           // !
	greaterThan = 0x3E,           // >
	lessThan = 0x3C,              // <
	minus = 0x2D,                 // -
	openBrace = 0x7B,             // {
	openBracket = 0x5B,           // [
	openParen = 0x28,             // (
	percent = 0x25,               // %
	plus = 0x2B,                  // +
	question = 0x3F,              // ?
	semicolon = 0x3B,             // ;
	singleQuote = 0x27,           // '
	slash = 0x2F,                 // /
	tilde = 0x7E,                 // ~

	backspace = 0x08,             // \b
	formFeed = 0x0C,              // \f
	byteOrderMark = 0xFEFF,
	tab = 0x09,                   // \t
	verticalTab = 0x0B,           // \v
}

/**
 * Parses the given text and returns the object the JSON content represents. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 * Therefore always check the errors list to find out if the input was valid.
 */
export function parse(text: string, errors: ParseError[] = [], options: ParseOptions = ParseOptions.DEFAULT): any {
	let currentProperty: string | null = null;
	let currentParent: any = [];
	const previousParents: any[] = [];

	function onValue(value: any) {
		if (Array.isArray(currentParent)) {
			(<any[]>currentParent).push(value);
		} else if (currentProperty !== null) {
			currentParent[currentProperty] = value;
		}
	}

	const visitor: JSONVisitor = {
		onObjectBegin: () => {
			const object = {};
			onValue(object);
			previousParents.push(currentParent);
			currentParent = object;
			currentProperty = null;
		},
		onObjectProperty: (name: string) => {
			currentProperty = name;
		},
		onObjectEnd: () => {
			currentParent = previousParents.pop();
		},
		onArrayBegin: () => {
			const array: any[] = [];
			onValue(array);
			previousParents.push(currentParent);
			currentParent = array;
			currentProperty = null;
		},
		onArrayEnd: () => {
			currentParent = previousParents.pop();
		},
		onLiteralValue: onValue,
		onError: (error: ParseErrorCode, offset: number, length: number) => {
			errors.push({ error, offset, length });
		}
	};
	visit(text, visitor, options);
	return currentParent[0];
}

/**
 * Parses the given text and invokes the visitor functions for each object, array and literal reached.
 */
function visit(text: string, visitor: JSONVisitor, options: ParseOptions = ParseOptions.DEFAULT): any {

	const _scanner = createScanner(text, false);

	function toNoArgVisit(visitFunction?: (offset: number, length: number) => void): () => void {
		return visitFunction ? () => visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength()) : () => true;
	}
	function toOneArgVisit<T>(visitFunction?: (arg: T, offset: number, length: number) => void): (arg: T) => void {
		return visitFunction ? (arg: T) => visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength()) : () => true;
	}

	const onObjectBegin = toNoArgVisit(visitor.onObjectBegin),
		onObjectProperty = toOneArgVisit(visitor.onObjectProperty),
		onObjectEnd = toNoArgVisit(visitor.onObjectEnd),
		onArrayBegin = toNoArgVisit(visitor.onArrayBegin),
		onArrayEnd = toNoArgVisit(visitor.onArrayEnd),
		onLiteralValue = toOneArgVisit(visitor.onLiteralValue),
		onSeparator = toOneArgVisit(visitor.onSeparator),
		onComment = toNoArgVisit(visitor.onComment),
		onError = toOneArgVisit(visitor.onError);

	const disallowComments = options && options.disallowComments;
	const allowTrailingComma = options && options.allowTrailingComma;
	function scanNext(): SyntaxKind {
		while (true) {
			const token = _scanner.scan();
			switch (_scanner.getTokenError()) {
				case ScanError.InvalidUnicode:
					handleError(ParseErrorCode.InvalidUnicode);
					break;
				case ScanError.InvalidEscapeCharacter:
					handleError(ParseErrorCode.InvalidEscapeCharacter);
					break;
				case ScanError.UnexpectedEndOfNumber:
					handleError(ParseErrorCode.UnexpectedEndOfNumber);
					break;
				case ScanError.UnexpectedEndOfComment:
					if (!disallowComments) {
						handleError(ParseErrorCode.UnexpectedEndOfComment);
					}
					break;
				case ScanError.UnexpectedEndOfString:
					handleError(ParseErrorCode.UnexpectedEndOfString);
					break;
				case ScanError.InvalidCharacter:
					handleError(ParseErrorCode.InvalidCharacter);
					break;
			}
			switch (token) {
				case SyntaxKind.LineCommentTrivia:
				case SyntaxKind.BlockCommentTrivia:
					if (disallowComments) {
						handleError(ParseErrorCode.InvalidCommentToken);
					} else {
						onComment();
					}
					break;
				case SyntaxKind.Unknown:
					handleError(ParseErrorCode.InvalidSymbol);
					break;
				case SyntaxKind.Trivia:
				case SyntaxKind.LineBreakTrivia:
					break;
				default:
					return token;
			}
		}
	}

	function handleError(error: ParseErrorCode, skipUntilAfter: SyntaxKind[] = [], skipUntil: SyntaxKind[] = []): void {
		onError(error);
		if (skipUntilAfter.length + skipUntil.length > 0) {
			let token = _scanner.getToken();
			while (token !== SyntaxKind.EOF) {
				if (skipUntilAfter.indexOf(token) !== -1) {
					scanNext();
					break;
				} else if (skipUntil.indexOf(token) !== -1) {
					break;
				}
				token = scanNext();
			}
		}
	}

	function parseString(isValue: boolean): boolean {
		const value = _scanner.getTokenValue();
		if (isValue) {
			onLiteralValue(value);
		} else {
			onObjectProperty(value);
		}
		scanNext();
		return true;
	}

	function parseLiteral(): boolean {
		switch (_scanner.getToken()) {
			case SyntaxKind.NumericLiteral: {
				let value = 0;
				try {
					value = JSON.parse(_scanner.getTokenValue());
					if (typeof value !== 'number') {
						handleError(ParseErrorCode.InvalidNumberFormat);
						value = 0;
					}
				} catch (e) {
					handleError(ParseErrorCode.InvalidNumberFormat);
				}
				onLiteralValue(value);
				break;
			}
			case SyntaxKind.NullKeyword:
				onLiteralValue(null);
				break;
			case SyntaxKind.TrueKeyword:
				onLiteralValue(true);
				break;
			case SyntaxKind.FalseKeyword:
				onLiteralValue(false);
				break;
			default:
				return false;
		}
		scanNext();
		return true;
	}

	function parseProperty(): boolean {
		if (_scanner.getToken() !== SyntaxKind.StringLiteral) {
			handleError(ParseErrorCode.PropertyNameExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
			return false;
		}
		parseString(false);
		if (_scanner.getToken() === SyntaxKind.ColonToken) {
			onSeparator(':');
			scanNext(); // consume colon

			if (!parseValue()) {
				handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
			}
		} else {
			handleError(ParseErrorCode.ColonExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
		}
		return true;
	}

	function parseObject(): boolean {
		onObjectBegin();
		scanNext(); // consume open brace

		let needsComma = false;
		while (_scanner.getToken() !== SyntaxKind.CloseBraceToken && _scanner.getToken() !== SyntaxKind.EOF) {
			if (_scanner.getToken() === SyntaxKind.CommaToken) {
				if (!needsComma) {
					handleError(ParseErrorCode.ValueExpected, [], []);
				}
				onSeparator(',');
				scanNext(); // consume comma
				if (_scanner.getToken() === SyntaxKind.CloseBraceToken && allowTrailingComma) {
					break;
				}
			} else if (needsComma) {
				handleError(ParseErrorCode.CommaExpected, [], []);
			}
			if (!parseProperty()) {
				handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
			}
			needsComma = true;
		}
		onObjectEnd();
		if (_scanner.getToken() !== SyntaxKind.CloseBraceToken) {
			handleError(ParseErrorCode.CloseBraceExpected, [SyntaxKind.CloseBraceToken], []);
		} else {
			scanNext(); // consume close brace
		}
		return true;
	}

	function parseArray(): boolean {
		onArrayBegin();
		scanNext(); // consume open bracket

		let needsComma = false;
		while (_scanner.getToken() !== SyntaxKind.CloseBracketToken && _scanner.getToken() !== SyntaxKind.EOF) {
			if (_scanner.getToken() === SyntaxKind.CommaToken) {
				if (!needsComma) {
					handleError(ParseErrorCode.ValueExpected, [], []);
				}
				onSeparator(',');
				scanNext(); // consume comma
				if (_scanner.getToken() === SyntaxKind.CloseBracketToken && allowTrailingComma) {
					break;
				}
			} else if (needsComma) {
				handleError(ParseErrorCode.CommaExpected, [], []);
			}
			if (!parseValue()) {
				handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBracketToken, SyntaxKind.CommaToken]);
			}
			needsComma = true;
		}
		onArrayEnd();
		if (_scanner.getToken() !== SyntaxKind.CloseBracketToken) {
			handleError(ParseErrorCode.CloseBracketExpected, [SyntaxKind.CloseBracketToken], []);
		} else {
			scanNext(); // consume close bracket
		}
		return true;
	}

	function parseValue(): boolean {
		switch (_scanner.getToken()) {
			case SyntaxKind.OpenBracketToken:
				return parseArray();
			case SyntaxKind.OpenBraceToken:
				return parseObject();
			case SyntaxKind.StringLiteral:
				return parseString(true);
			default:
				return parseLiteral();
		}
	}

	scanNext();
	if (_scanner.getToken() === SyntaxKind.EOF) {
		if (options.allowEmptyContent) {
			return true;
		}
		handleError(ParseErrorCode.ValueExpected, [], []);
		return false;
	}
	if (!parseValue()) {
		handleError(ParseErrorCode.ValueExpected, [], []);
		return false;
	}
	if (_scanner.getToken() !== SyntaxKind.EOF) {
		handleError(ParseErrorCode.EndOfFileExpected, [], []);
	}
	return true;
}

export function getNodeType(value: any): NodeType {
	switch (typeof value) {
		case 'boolean': return 'boolean';
		case 'number': return 'number';
		case 'string': return 'string';
		case 'object': {
			if (!value) {
				return 'null';
			} else if (Array.isArray(value)) {
				return 'array';
			}
			return 'object';
		}
		default: return 'null';
	}
}
