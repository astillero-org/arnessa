# Environment Lifecycle Management

## 1. Discovery and Inventory

The agent identifies available environments (live or startable) via the `EnvironmentManager`.

*   **Query**: `list_available_environments(max_lifetime=3600)`
*   **Result**: Returns a list of environment descriptors:
    *   `id`: Unique identifier (if live) or template name (if available).
    *   `type`: `local`, `k8s`, etc.
    *   `status`: `live` | `available`.
    *   `tools`: Base tools (e.g., `inspect`, `ping`) already active.

## 2. Environment Activation & Dynamic Tooling

Once an environment is selected, the `EnvironmentManagerHandle` provides more specific tools.

*   **Action**: `start_environment(env_id)` or `attach_environment(env_id)`.
*   **Dynamic Injection**:
    *   While the environment is **live**, the agent's available tools expand dynamically.
    *   The `EnvironmentManagerHandle` injects specialized tools: `execute_command`, `read_file`, `write_file`, etc., specific to that environment's context.

## 3. Operations & Management

The agent uses the dynamic tools to complete its tasks (running code, analyzing logs, modifying files).

*   **Persistence**: The environment remains alive as long as the agent is active or until `max_lifetime` is reached.
*   **Safety**: All operations are proxied through the `EnvironmentManagerHandle`.

## 4. Termination

After completing the task, the agent is responsible for cleaning up the environment.

*   **Action**: `kill_environment(env_id)`.
*   **Cleanup**: `EnvironmentManager` terminates the process/pod, removes temp files, and the handle revokes the dynamic tools.
