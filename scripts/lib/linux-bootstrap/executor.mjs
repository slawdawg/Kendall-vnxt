export function createExecutor({ runLocal }) {
  return {
    command(command, args = [], options = {}) {
      return runLocal(command, args, options);
    },
    shell(command, options = {}) {
      return runLocal("bash", ["-lc", command], options);
    },
  };
}
