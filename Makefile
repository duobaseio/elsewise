# Elsewise: cross-toolchain entry point (pnpm + flutter).
# Run `make` or `make help` for the target listing.

BLUE  := \033[0;34m
GREEN := \033[0;32m
RED   := \033[0;31m
BOLD  := \033[1m
RESET := \033[0m

TOOLS := tools
BUF   := pnpm --filter @elsewise/transport exec buf
PROTO := ../../../proto

.DEFAULT_GOAL := help

.PHONY: help doctor bootstrap bs install i generate g icons lint l fix f test t

help:
	@echo "$(BOLD)Elsewise$(RESET) - make targets"
	@echo "  $(BOLD)doctor$(RESET)           check required toolchains are installed"
	@echo "  $(BOLD)bootstrap$(RESET) (bs)   doctor + install every toolchain's deps + generate"
	@echo "  $(BOLD)install$(RESET)   (i)    pnpm + flutter pub get"
	@echo "  $(BOLD)generate$(RESET)  (g)    protobuf TS bindings (every package with a generate script)"
	@echo "  $(BOLD)icons$(RESET)            resolve icon tints + emit the file-icon tables and assets into packages/components"
	@echo "  $(BOLD)lint$(RESET)      (l)    biome + tsc (every package) + buf + dart analyze"
	@echo "  $(BOLD)fix$(RESET)       (f)    auto-fix what lint checks (biome, buf format, dart format)"
	@echo "  $(BOLD)test$(RESET)      (t)    vitest (every package) + flutter test (golden sheets)"
	@echo ""

doctor:
	@ok=1; \
	for tool in \
		"pnpm|--version|corepack enable pnpm  (or: npm install -g pnpm)" \
		"flutter|--version|https://docs.flutter.dev/install  (tools/ is a Flutter package: >= 3.47.0)" \
		"dart|--version|ships with the Flutter SDK; make sure its bin/ is on PATH"; do \
		name=$${tool%%|*}; rest=$${tool#*|}; args=$${rest%%|*}; hint=$${rest#*|}; \
		if $$name $$args >/dev/null 2>&1 </dev/null; then \
			printf "$(GREEN)✓$(RESET) %s\n" "$$name"; \
		else \
			printf "$(RED)✗ %-7s$(RESET) missing — %s\n" "$$name" "$$hint"; ok=0; \
		fi; \
	done; \
	if [ $$ok -eq 1 ]; then \
		echo "$(GREEN)✓ all toolchains present$(RESET)"; \
	else \
		echo ""; \
		echo "$(RED)Install the missing tools above, then re-run.$(RESET)"; \
		exit 1; \
	fi

bootstrap bs: doctor install generate
	@echo "$(GREEN)✓ bootstrap complete$(RESET)"

install i:
	@echo "$(BLUE)pnpm install$(RESET)"
	@pnpm install
	@echo "$(BLUE)cd $(TOOLS) && flutter pub get$(RESET)"
	@cd $(TOOLS) && flutter pub get
	@echo "$(GREEN)✓ dependencies installed$(RESET)"

generate g:
	@echo "$(BLUE)pnpm -r generate$(RESET)"
	@pnpm -r generate
	@echo "$(GREEN)✓ generated$(RESET)"

icons:
	@echo "$(BLUE)cd $(TOOLS) && dart run bin/file-icons/emit_typescript_icons.dart$(RESET)"
	@cd $(TOOLS) && dart run bin/file-icons/emit_typescript_icons.dart
	@echo "$(GREEN)✓ icons emitted$(RESET)"

lint l:
	@echo "$(BLUE)pnpm -r check$(RESET)"
	@pnpm -r check
	@echo "$(BLUE)pnpm -r typecheck$(RESET)"
	@pnpm -r typecheck
	@echo "$(BLUE)buf lint proto$(RESET)"
	@$(BUF) lint $(PROTO)
	@echo "$(BLUE)buf format --diff --exit-code proto$(RESET)"
	@$(BUF) format --diff --exit-code $(PROTO)
	@echo "$(BLUE)cd $(TOOLS) && dart analyze$(RESET)"
	@cd $(TOOLS) && dart analyze
	@echo "$(GREEN)✓ lint clean$(RESET)"

fix f:
	@echo "$(BLUE)pnpm -r exec biome check --write$(RESET)"
	@pnpm -r exec biome check --write
	@echo "$(BLUE)buf format -w proto$(RESET)"
	@$(BUF) format -w $(PROTO)
	@echo "$(BLUE)cd $(TOOLS) && dart format .$(RESET)"
	@cd $(TOOLS) && dart format .
	@echo "$(GREEN)✓ fixes applied$(RESET)"

test t:
	@echo "$(BLUE)pnpm -r test$(RESET)"
	@pnpm -r test
	@echo "$(BLUE)cd $(TOOLS) && flutter test$(RESET)"
	@cd $(TOOLS) && flutter test
	@echo "$(GREEN)✓ tests passed$(RESET)"
