export interface ManagerResetInput { username:string;password:string; }
export declare function prepareManagerReset(input:ManagerResetInput,salt?:Uint8Array):string;
