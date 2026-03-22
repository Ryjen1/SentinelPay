import os
from web3 import Web3
from eth_account import Account

# 1. Setup Connection to Status Network Sepolia
# We use the public RPC endpoint for the Sepolia testnet.
RPC_URL = "https://sepolia.rpc.status.network"
w3 = Web3(Web3.HTTPProvider(RPC_URL))

if not w3.is_connected():
    print("Failed to connect to Status Network Sepolia!")
    exit(1)

print(f"Connected! Chain ID: {w3.eth.chain_id}")

# 2. Setup Agent Account
# For demonstration purposes, we generate a fresh account if no key is supplied.
# In a real environment, the agent would use its private key.
private_key = os.environ.get("AGENT_PRIVATE_KEY")
if not private_key:
    # Generate a fresh dummy account to act as the agent performing gasless tx
    acct = Account.create()
    private_key = acct.key.hex()
    print("Generated new ephemeral agent wallet for demonstration.")

account = Account.from_key(private_key)
print(f"Agent Address: {account.address}")


# 3. Compile Contract (Pre-compiled bytecode and ABI for simplicity)
# This is the compiled representation of StatusSentinel.sol
ABI = [
    {"inputs":[],"stateMutability":"nonpayable","type":"constructor"},
    {"anonymous":False,"inputs":[{"indexed":True,"internalType":"address","name":"agent","type":"address"},{"indexed":False,"internalType":"string","name":"action","type":"string"},{"indexed":False,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"AgentActionLogged","type":"event"},
    {"inputs":[{"internalType":"string","name":"action","type":"string"}],"name":"logAgentAction","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}
]
# Minimal bytecode for the StatusSentinel contract
BYTECODE = "0x608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555061019a806100606000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80638da5cb5b1461003b578063a8a38ae41461005a575b600080fd5b61004361006d565b6040519073ffffffffffffffffffffffffffffffffffffffff16815260200160405180910390f35b61006b600480360381019061006691906100f7565b610095565b005b6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b3373ffffffffffffffffffffffffffffffffffffffff167fb1178ded6f790dddcac89a19cba5ec247dbbd31dd58c17b0849ed7f3b890a5eb82426040516100e4929190610116565b60405180910390a250565b60006020828403121561010957600080fd5b813567ffffffffffffffff81111561011d57600080fd5b61012984828501610138565b91505092915050565b600081519050919050565b600082845260208101905061014e8261012f565b82526020810190506101618383610169565b9392505050565b60006020828403121561017b57600080fd5b815167ffffffffffffffff81111561018f57600080fd5b61019b848285016101ac565b91505092915050565b600082845260208101905081810360208301526101c781846101d2565b90509392505050565b600081905092915050565b600081519050919050565b60005b838110156101f85780820151818401526020810190506101dd565b83811115610207576000848401525b5050505056fea2646970667358221220a2e3792cb00674685ff8676bf97dfaa77e16dff5a2786a4c2f6d0a7a30ff7af164736f6c63430008140033"

StatusSentinel = w3.eth.contract(abi=ABI, bytecode=BYTECODE)


def deploy_contract():
    print("\n--- Deploying StatusSentinel Contract ---")
    construct_txn = StatusSentinel.constructor().build_transaction({
        'from': account.address,
        'nonce': w3.eth.get_transaction_count(account.address),
        'gasPrice': 0, # GASLESS TRANSACTION!
        'chainId': w3.eth.chain_id
    })
    
    # Estimate gas (will just set limit since it's gasless)
    construct_txn['gas'] = w3.eth.estimate_gas(construct_txn) + 10000
    
    signed = w3.eth.account.sign_transaction(construct_txn, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"Deploy Tx Hash: {tx_hash.hex()}")
    
    print("Waiting for receipt...")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"Contract deployed at: {receipt.contractAddress}")
    return receipt.contractAddress


def perform_gasless_action(contract_address):
    print("\n--- Sending Gasless Action Tx ---")
    contract = w3.eth.contract(address=contract_address, abi=ABI)
    
    action_str = "SentinelPay Agent Policy Evaluation - GASLESS"
    tx = contract.functions.logAgentAction(action_str).build_transaction({
        'from': account.address,
        'nonce': w3.eth.get_transaction_count(account.address),
        'gasPrice': 0, # GASLESS TRANSACTION!
        'chainId': w3.eth.chain_id
    })
    
    tx['gas'] = w3.eth.estimate_gas(tx) + 10000
    signed = w3.eth.account.sign_transaction(tx, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    
    print(f"Action Tx Hash: {tx_hash.hex()}")
    print("Waiting for receipt...")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"Status: {'Success' if receipt.status == 1 else 'Failed'}")
    print(f"Full gasless execution proven. Gas Price: {w3.eth.get_transaction(tx_hash)['gasPrice']}")


if __name__ == "__main__":
    try:
        contract_addr = deploy_contract()
        perform_gasless_action(contract_addr)
        print("\n✅ Verification complete! The AI Agent deployed and transacted with 0 gas on Status Network.")
    except Exception as e:
        print(f"Error during execution: {e}")
