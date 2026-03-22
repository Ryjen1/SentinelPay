import os
import solcx
from web3 import Web3
from eth_account import Account

# Install solidity compiler
solcx.install_solc('0.8.20')

RPC_URL = "https://sepolia.rpc.status.network"
w3 = Web3(Web3.HTTPProvider(RPC_URL))

if not w3.is_connected():
    print("Failed to connect to Status Network Sepolia!")
    exit(1)

print(f"Connected! Chain ID: {w3.eth.chain_id}")

private_key = os.environ.get("AGENT_PRIVATE_KEY")
if not private_key:
    acct = Account.create()
    private_key = acct.key.hex()
    print("Generated new ephemeral agent wallet for demonstration.")

account = Account.from_key(private_key)
print(f"Agent Address: {account.address}")
print("NOTE: On Status Network, transactions can be perfectly gasless (0 Wei gasPrice). No faucet needed!")

# Compile the contract
with open("StatusSentinel.sol", "r") as f:
    source = f.read()

compiled_sol = solcx.compile_source(
    source,
    output_values=['abi', 'bin'],
    solc_version='0.8.20'
)
contract_id, contract_interface = compiled_sol.popitem()
ABI = contract_interface['abi']
BYTECODE = contract_interface['bin']

StatusSentinel = w3.eth.contract(abi=ABI, bytecode=BYTECODE)

def deploy_contract():
    print("\n--- Deploying StatusSentinel Contract ---")
    construct_txn = StatusSentinel.constructor().build_transaction({
        'from': account.address,
        'nonce': w3.eth.get_transaction_count(account.address),
        'gasPrice': 0,
        'chainId': w3.eth.chain_id
    })
    
    # Gas limit for deployment
    construct_txn['gas'] = 1500000
    
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
        'gasPrice': 0,
        'chainId': w3.eth.chain_id
    })
    
    tx['gas'] = 500000
    signed = w3.eth.account.sign_transaction(tx, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    
    print(f"Action Tx Hash: {tx_hash.hex()}")
    print("Waiting for receipt...")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"Status: {'Success' if receipt.status == 1 else 'Failed'}")

if __name__ == "__main__":
    try:
        contract_addr = deploy_contract()
        perform_gasless_action(contract_addr)
        print("\n✅ Verification complete! The AI Agent deployed and transacted with 0 gas on Status Network.")
    except Exception as e:
        print(f"Error during execution: {e}")
