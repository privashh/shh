# shh SVM devnet. On Windows without make, run the `docker compose` commands directly.
.PHONY: up down reset logs ps verify demo

up:              ## start the single-node SVM devnet + settler
	docker compose up -d --build

down:            ## stop services
	docker compose down

reset:           ## stop and wipe ledger + settler state
	docker compose down -v

logs:
	docker compose logs -f

ps:
	docker compose ps

verify:          ## gate: deploy a real program against the chain and read it back
	docker compose exec svm-node sh /scripts/verify-deploy.sh

demo:            ## Token-2022 confidential transfer demo (amounts encrypted on-chain)
	docker compose exec svm-node sh /scripts/confidential-demo.sh
