export interface BootstrapInput { username: string; name: string; password: string }
export declare function prepareBootstrap(input: BootstrapInput,id?:string,salt?:Uint8Array):string;
