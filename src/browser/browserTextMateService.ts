import { AbstractTextMateService } from './abstractTextMateService';

export class TextMateService extends AbstractTextMateService {
	protected async _loadVSCodeOnigurumWASM(): Promise<Response | ArrayBuffer> {
  	const response = await fetch('/assets/onig.wasm');
		// Using the response directly only works if the server sets the MIME type 'application/wasm'.
		// Otherwise, a TypeError is thrown when using the streaming compiler.
		// We therefore use the non-streaming compiler :(.
		return await response.arrayBuffer();
	}
}

