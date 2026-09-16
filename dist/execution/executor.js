// ─── Factory ──────────────────────────────────────────────────────────────────
export async function createExecutor(mode) {
    if (mode === 'delegate') {
        const { DelegateExecutor } = await import('./delegate-executor.js');
        return new DelegateExecutor();
    }
    const { NativeExecutor } = await import('./native-executor.js');
    return new NativeExecutor();
}
//# sourceMappingURL=executor.js.map