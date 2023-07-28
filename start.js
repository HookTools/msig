const fs = require('fs');
const childProcess = require('child_process');
const { Api, JsonRpc,Serialize } = require('eosjs');

const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');  // development only
const { TextDecoder, TextEncoder } = require('util'); //node only


//RPC URL
const apiURL = 'https://testnet.waxsweden.org'
// WASM/ABI file name
const file_name = 'eosio.token'
//Transaction expiration
const date = "2023-08-01T07:15:49"
// receive MSIG
const wallet = 'hookbuilders'
// sender transaction
const sender = 'hookbuilders'
// cleos wallet unlock password
const password = "PW5KbhkY4WGjxA82VrUU6xBchcgkUXessZFXd4cx6WpMcUygefQDK"



async function start() {
    const wasmFilePath = `${file_name}.wasm`
    const wasm_file = fs.readFileSync(wasmFilePath).toString('hex')

    const abiFilePath = `${file_name}.abi`
    const abi_file = JSON.parse(fs.readFileSync(abiFilePath, 'utf8'))

    const trx = createTRX(wasm_file, abi_file)
    //Unlock cleos
    try{
        const unlock_args = `wallet unlock -n hooktools --password ${password}`
        childProcess.spawnSync('cleos', unlock_args.split(' '))
    } catch(e) {}
    //send transactions
    const trx_args = `-u ${apiURL} multisig propose_trx ${rng(12)} [{"actor":"${wallet}","permission":"active"}] ${trx}  -p ${sender}@active`
    try{
        return childProcess.spawnSync('cleos', trx_args.split(' ')).stdout.toString()
    } catch(e) {
        console.log(e.output.toString())
    }
}


function createTRX (wasmHexString,abiJSON) {
    const signatureProvider = new JsSignatureProvider([]);
    const rpc = new JsonRpc(apiURL, { fetch }); //required to read blockchain state
    const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() }); //required to submit transactions


    const buffer = new Serialize.SerialBuffer({
        textEncoder: api.textEncoder,
        textDecoder: api.textDecoder,
    })

    const abiDefinitions = api.abiTypes.get('abi_def')
    
    abiJSON = abiDefinitions.fields.reduce(
        (acc, { name: fieldName }) =>
            Object.assign(acc, { [fieldName]: acc[fieldName] || [] }),
            abiJSON
        )

    abiDefinitions.serialize(buffer, abiJSON)
    let serializedAbiHexString = Buffer.from(buffer.asUint8Array()).toString('hex')

    let wasmData = JSON.stringify({
        "account": wallet,
        "vmtype": 0,
        "vmversion": 0,
        "code": wasmHexString,
        "memo": ""
    })

    let abiData = JSON.stringify({
        "account": wallet,
        "abi": serializedAbiHexString,
        "memo": ""
    })

    const wasm_args = `-u ${apiURL} convert pack_action_data eosio setcode ${wasmData}`
    const wasm_child = childProcess.spawnSync('cleos',wasm_args.split(' '));
    wasmData =  wasm_child.stdout.toString().replace('\n', '')

    const abi_args = `-u ${apiURL} convert pack_action_data eosio setabi ${abiData}`
    const abi_child = childProcess.spawnSync('cleos',abi_args.split(' '));
    abiData =  abi_child.stdout.toString().replace('\n', '')

    const trxData = {
        "expiration": date,
        "ref_block_num": 0,
        "ref_block_prefix": 0,
        "max_net_usage_words": 0,
        "max_cpu_usage_ms": 0,
        "delay_sec": 0,
        "context_free_actions": [],
        "actions": [{
            "account": "eosio",
            "name": "setcode",
            "authorization": [{
                "actor": wallet,
                "permission": "active"
            }
            ],
            "data": wasmData
        },
        {
            "account": "eosio",
            "name": "setabi",
            "authorization": [{
                "actor": wallet,
                "permission": "active"
            }
            ],
            "data": abiData
        }
        ],
        "transaction_extensions": [],
        "context_free_data": []
    }

    return JSON.stringify(trxData);

}

//generate random msig name 
function rng(length) {
    let result = '';
    const characters = 'abcdefghijklmnopqrstuvwxyz12345';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}

console.log(start())
