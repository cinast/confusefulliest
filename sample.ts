// 测试用TypeScript文件

const MAX_COUNT = 10;
let currentCount = 0;

class MyComponent {
    state: {};
    constructor() {
        this.state = {};
    }

    render() {
        return null;
    }
}

function calculateSum(a: number, b: number): number {
    return a + b;
}

const App = () => {
    const [state, setState] = [0, 0];
    return "";
};

// TypeScript特有语法
interface User {
    name: string;
    age: number;
}

type UserID = string | number;

enum Status {
    Active = "ACTIVE",
    Inactive = "INACTIVE",
}

namespace Utils {
    export function log(message: string): void {
        console.log(message);
    }
}

class Service {}

export default App;
