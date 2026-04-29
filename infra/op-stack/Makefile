# shh OP Stack devnet. On Windows without make, use scripts/generate.ps1 + `docker compose` directly.
.PHONY: generate up down reset logs ps

generate:        ## deploy L1 contracts + emit genesis/rollup/jwt
	bash scripts/generate.sh

up:              ## start the single-sequencer L3
	docker compose up -d

down:            ## stop services
	docker compose down

reset:           ## stop and wipe state + generated config
	docker compose down -v
	rm -rf configs/genesis.json configs/rollup.json configs/jwt.txt .deployer

logs:
	docker compose logs -f

ps:
	docker compose ps
