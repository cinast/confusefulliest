import { propRules } from "./propRules";

class Account {
    @propRules.noZero
    balance: number = 100;

    @propRules.noOver(1000)
    maxTransfer: number = 500;

    @propRules.noLower(100)
    minBalance: number = 100;

    @propRules.watchSet<string>((_, __, val) => val.toUpperCase())
    username: string = "";

    _admin: boolean = false;

    @propRules.onlyWhen(function (this: Account) {
        return this._admin;
    })
    sensitiveData: string = "";

    @propRules.onlyTheClassAndSubCanWrite(class Temp {})
    protected _secret: string = "confidential";
}

class SubAccount extends Account {
    updateSecret(newVal: string) {
        this._secret = newVal; // 允许子类修改
    }
}

// 测试用例
const acc = new Account();
const subAcc = new SubAccount();

// 测试noZero
acc.balance = -50;
console.log(acc.balance); // 0

// 测试noOver
acc.maxTransfer = 1500;
console.log(acc.maxTransfer); // 1000

// 测试noLower
acc.minBalance = 50;
console.log(acc.minBalance); // 100

// 测试watchSet
acc.username = "test";
console.log(acc.username); // 'TEST'

// 测试onlyWhen
acc.sensitiveData = "data";
console.log(acc.sensitiveData); // ''
acc._admin = true;
acc.sensitiveData = "data";
console.log(acc.sensitiveData); // 'data'

// 测试onlyTheClassAndSubCanWrite
console.log("原始_secret:", subAcc.updateSecret("initial secret")); // 通过方法访问
console.log("新_secret:", subAcc.updateSecret("updated secret"));
