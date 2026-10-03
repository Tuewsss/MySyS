/**
 * Está dentro de uma pasta do OneDrive ("OneDrive" ou "OneDrive - Empresa")?
 * Apagar ali também apaga na nuvem, porque o OneDrive sincroniza a exclusão.
 */
export const isInOneDrive = (p: string) => /\\onedrive( - [^\\]+)?(\\|$)/i.test(p)
