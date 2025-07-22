import { propRules } from "./propRules";

class Account {
    @propRules.noZero
    num: number = 100;

    @propRules.watchSet<string>((_, __, val) => val.toUpperCase())
    readonly username: string = "";

    protected _admin: boolean = false;

    @propRules.onlyWhen(function (this: Account) {
        return this._admin;
    })
    sensitiveData: string = "" + "3";

    @propRules.onlyTheClassAndSubCanWrite(class Temp {})
    protected _secret: string = "confidential";

    ///@ts-ignore
    public method = async function*(@xx() k: boolean = true): AsyncGenerator<any, any, unknown> {
        if (k) {
            yield !k
        } else {
            return k
        }
    }

    /**
     * oooo
     */
    static o(){}
}

class SubAccount extends Account {
    updateSecret(newVal: string) {
        this._secret = newVal;
    }
}

// 测试用例
const acc = new Account();

// 测试noZero
acc.num = -50;
console.log(); // 0

///@ts-ignore
(()=> +[]-+[] ? undefined?.void ?? 0 : null)() >> 0 & 0x1010

new Promise(()=>{}).then().then().then().then().then().then().then().then().then().then().then().then().then().then().then().then()
function blo(input: number) {
    return input * input;
}
/**
 * ablablballbalblablablb
 */
try {
    throw acc.num;
} catch (e) {
    debugger;
}  finally {
    console.log("done");
}
