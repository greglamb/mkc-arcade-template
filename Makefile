all: build

build:
	mkc build -j

clean:
	mkc clean

serve:
	trap 'sed -i "" "s/export let DEBUG = true/export let DEBUG = false/" config.ts' EXIT INT TERM; \
	sed -i "" "s/export let DEBUG = false/export let DEBUG = true/" config.ts; \
	(sleep 2 && open http://127.0.0.1:7001/) & mkc serve

dev-reset:
	sed -i "" "s/export let DEBUG = true/export let DEBUG = false/" config.ts
